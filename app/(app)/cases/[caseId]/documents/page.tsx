'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Upload, CheckCircle, Clock, AlertCircle, Loader2, FileText, Layers, Copy, ScanLine } from 'lucide-react';

const DOC_TYPES = [
  { value: 'police_report', label: 'Police Report' },
  { value: 'witness_statement', label: 'Witness Statement' },
  { value: 'autopsy', label: 'Autopsy / Medical' },
  { value: 'evidence_log', label: 'Evidence Log' },
  { value: 'photo', label: 'Photo / Image' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'interview', label: 'Interview Transcript' },
  { value: 'other', label: 'Other' },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { icon: Clock, text: 'Pending', color: 'text-yellow-400 bg-yellow-400/10' },
    processing: { icon: Loader2, text: 'Processing...', color: 'text-blue-400 bg-blue-400/10', spin: true },
    complete: { icon: CheckCircle, text: 'Complete', color: 'text-green-400 bg-green-400/10' },
    failed: { icon: AlertCircle, text: 'Failed', color: 'text-red-400 bg-red-400/10' },
  }[status] || { icon: Clock, text: status, color: 'text-gray-400 bg-gray-400/10' };

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${config.color}`}>
      <Icon className={`w-3 h-3 ${'spin' in config && config.spin ? 'animate-spin' : ''}`} />
      {config.text}
    </span>
  );
}

interface BatchStats {
  fileCount: number;
  completedFileCount: number;
  failedFileCount: number;
  pageCount: number;
  lowConfidencePageCount: number;
  duplicatePageCount: number;
}

interface ImportBatch {
  id: string;
  label: string | null;
  status: string;
  error: string | null;
  created_at: string;
  stats: BatchStats;
}

export default function DocumentsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [files, setFiles] = useState<any[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('other');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadFiles = useCallback(async () => {
    const [filesRes, batchesRes] = await Promise.all([
      apiFetch(`/api/cases/${caseId}/files`),
      apiFetch(`/api/cases/${caseId}/import-batches`),
    ]);
    const filesData = await filesRes.json();
    const batchesData = await batchesRes.json();
    setFiles(filesData.files || []);
    setIntake(filesData.intake || null);
    setBatches(batchesData.batches || []);
    return filesData.files || [];
  }, [caseId]);

  useEffect(() => {
    loadFiles().finally(() => setLoading(false));
  }, [loadFiles]);

  // Poll while any file is processing
  useEffect(() => {
    const hasProcessing = files.some(f => f.processing_status === 'pending' || f.processing_status === 'processing');
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(loadFiles, 4000);
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [files, loadFiles]);

  async function createBatch(fileCount: number): Promise<string | undefined> {
    const res = await apiFetch(`/api/cases/${caseId}/import-batches`, {
      method: 'POST',
      body: JSON.stringify({
        label: `Upload of ${fileCount} file${fileCount === 1 ? '' : 's'} — ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) { alert('Failed to start import batch: ' + (data.error || 'Unknown error')); return undefined; }
    return data.batch.id;
  }

  async function uploadFile(file: File, importBatchId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const ext = file.name.split('.').pop();
    const storagePath = `${session.user.id}/${caseId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('case-files')
      .upload(storagePath, file, { upsert: false });

    if (uploadError) { alert(`Upload failed for ${file.name}: ` + uploadError.message); return false; }

    const fileType = file.type.startsWith('image/') ? 'image' : ext === 'pdf' ? 'pdf' : 'other';
    const res = await apiFetch(`/api/cases/${caseId}/files`, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, storagePath, fileType, fileSize: file.size, documentType: docType, importBatchId }),
    });
    const data = await res.json();
    if (!res.ok) { alert(`Intake failed for ${file.name}: ` + (data.error || 'Unable to register file')); return false; }
    return true;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      // One labeled batch per drop/selection, created up front so every file
      // in this intake action shares it.
      const importBatchId = await createBatch(fileList.length);
      if (!importBatchId) return;
      for (const file of Array.from(fileList)) {
        await uploadFile(file, importBatchId);
      }
      await loadFiles();
    } finally {
      setUploading(false);
    }
  }

  const filesByBatch = files.reduce<Record<string, any[]>>((acc, file) => {
    const key = file.import_batch_id || 'unbatched';
    (acc[key] ||= []).push(file);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Documents</h1>
        <p className="text-gray-400 text-sm mt-1">Case intake foundation: group uploads into batches, track page-level OCR, and flag duplicate or low-confidence pages.</p>
      </div>

      {intake && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><Layers className="w-3.5 h-3.5" /> Import batches</div>
            <div className="text-2xl font-bold text-white mt-2">{batches.length || intake.batches?.length || 0}</div>
          </div>
          <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><ScanLine className="w-3.5 h-3.5" /> Pages processed</div>
            <div className="text-2xl font-bold text-white mt-2">{intake.pageCount || 0}</div>
          </div>
          <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><FileText className="w-3.5 h-3.5" /> Documents detected</div>
            <div className="text-2xl font-bold text-white mt-2">{intake.documentsDetected || 0}</div>
          </div>
          <Link href={`/cases/${caseId}/review`} className="bg-[#1a1d27] border border-[#2a2d3a] hover:border-yellow-500/50 rounded-xl p-4 transition-colors">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><AlertCircle className="w-3.5 h-3.5" /> Low confidence</div>
            <div className="text-2xl font-bold text-white mt-2">{intake.lowConfidencePages || 0}</div>
            <div className="text-yellow-400/80 text-xs mt-1">Open review queue →</div>
          </Link>
          <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><Copy className="w-3.5 h-3.5" /> Duplicate pages</div>
            <div className="text-2xl font-bold text-white mt-2">{intake.duplicatePages || 0}</div>
          </div>
        </div>
      )}

      {/* Upload area */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm text-gray-400">Document type:</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className="bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInput.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-[#2a2d3a] hover:border-indigo-500/50 hover:bg-white/2'
          }`}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-indigo-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-300 font-medium">Drop files here or click to upload</p>
              <p className="text-gray-500 text-sm mt-1">PDF, JPG, PNG, WEBP — police reports, statements, photos, evidence logs</p>
            </>
          )}
        </div>
        <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Intake batches with their files */}
      {loading ? <div className="text-gray-400">Loading files...</div> : files.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No files uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {batches.filter(batch => (filesByBatch[batch.id] || []).length > 0).map(batch => (
            <div key={batch.id} className="bg-[#141721] border border-[#2a2d3a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <p className="text-white text-sm font-medium truncate">{batch.label || 'Import batch'}</p>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">
                    {batch.stats.fileCount} file{batch.stats.fileCount === 1 ? '' : 's'}
                    {` · ${batch.stats.pageCount} page${batch.stats.pageCount === 1 ? '' : 's'}`}
                    {batch.stats.lowConfidencePageCount > 0 && ` · ${batch.stats.lowConfidencePageCount} low confidence`}
                    {batch.stats.duplicatePageCount > 0 && ` · ${batch.stats.duplicatePageCount} duplicate`}
                    {` · ${new Date(batch.created_at).toLocaleString()}`}
                  </p>
                  {batch.error && <p className="text-red-400 text-xs mt-1">{batch.error}</p>}
                </div>
                <StatusBadge status={batch.status} />
              </div>
              <div className="space-y-2">
                {(filesByBatch[batch.id] || []).map(file => (
                  <div key={file.id} className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{file.filename}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {DOC_TYPES.find(t => t.value === file.document_type)?.label || file.document_type}
                          {file.file_size && ` · ${(file.file_size / 1024).toFixed(0)} KB`}
                          {file.page_count && ` · ${file.page_count} page${file.page_count === 1 ? '' : 's'}`}
                          {file.processing_error && <span className="text-red-400"> · {file.processing_error}</span>}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={file.processing_status} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {(filesByBatch['unbatched'] || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-gray-400 text-xs uppercase tracking-wide">Not in a batch</p>
              {filesByBatch['unbatched'].map(file => (
                <div key={file.id} className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{file.filename}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {DOC_TYPES.find(t => t.value === file.document_type)?.label || file.document_type}
                        {file.file_size && ` · ${(file.file_size / 1024).toFixed(0)} KB`}
                        {file.page_count && ` · ${file.page_count} pages`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={file.processing_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
