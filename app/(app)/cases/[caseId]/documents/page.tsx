'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Upload, CheckCircle, Clock, AlertCircle, Loader2, FileText } from 'lucide-react';

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

export default function DocumentsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('other');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadFiles = useCallback(async () => {
    const res = await apiFetch(`/api/cases/${caseId}/files`);
    const data = await res.json();
    setFiles(data.files || []);
    return data.files || [];
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

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const ext = file.name.split('.').pop();
      const storagePath = `${session.user.id}/${caseId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) { alert('Upload failed: ' + uploadError.message); return; }

      const fileType = file.type.startsWith('image/') ? 'image' : ext === 'pdf' ? 'pdf' : 'other';
      await apiFetch(`/api/cases/${caseId}/files`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, storagePath, fileType, fileSize: file.size, documentType: docType }),
      });

      await loadFiles();
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      await uploadFile(file);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">Documents</h1>

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

      {/* File list */}
      {loading ? <div className="text-gray-400">Loading files...</div> : files.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No files uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <div key={file.id} className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-5 py-4">
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
  );
}
