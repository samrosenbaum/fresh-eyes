'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, AlertCircle, CheckCircle, FileText, Loader2, ScanLine, Quote } from 'lucide-react';

interface ReviewPage {
  id: string;
  file_id: string;
  page_number: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_method: string | null;
  case_files: { filename: string } | null;
}

interface UnverifiedFacts {
  statements: any[];
  relationships: any[];
  timelineEvents: any[];
  mentionCount: number;
}

function PageReviewCard({ page, caseId, onDone }: { page: ReviewPage; caseId: string; onDone: () => void }) {
  const [text, setText] = useState(page.ocr_text || '');
  const [saving, setSaving] = useState(false);

  async function submit(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/cases/${caseId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ pageId: page.id, ...body }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert('Update failed: ' + (data.error || 'Unknown error'));
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <p className="text-white text-sm font-medium truncate">
            {page.case_files?.filename || 'Unknown file'} — page {page.page_number}
          </p>
        </div>
        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full flex-shrink-0">
          {typeof page.ocr_confidence === 'number' ? `${Math.round(page.ocr_confidence * 100)}% confidence` : 'unknown confidence'}
        </span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
        className="w-full bg-[#12141c] border border-[#2a2d3a] rounded-lg p-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-indigo-500"
        placeholder="Transcription for this page..."
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => submit({ ocrText: text })}
          disabled={saving}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          Save correction
        </button>
        <button
          onClick={() => submit({ reviewStatus: 'reviewed' })}
          disabled={saving}
          className="flex items-center gap-1.5 bg-[#2a2d3a] hover:bg-[#343849] disabled:opacity-50 text-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          Transcription is correct
        </button>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [pages, setPages] = useState<ReviewPage[]>([]);
  const [unverified, setUnverified] = useState<UnverifiedFacts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/cases/${caseId}/review`);
    const data = await res.json();
    setPages(data.pages || []);
    setUnverified(data.unverified || null);
  }, [caseId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const unverifiedCount = unverified
    ? unverified.statements.length + unverified.relationships.length + unverified.timelineEvents.length
    : 0;

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}/documents`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to documents
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Review Queue</h1>
        <p className="text-gray-400 text-sm mt-1">
          Low-confidence pages and extracted facts whose source quotes could not be verified. Confirm or correct before relying on them.
        </p>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading review queue...</div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ScanLine className="w-4 h-4 text-yellow-400" />
              <h2 className="text-white font-semibold text-sm">Pages needing review ({pages.length})</h2>
            </div>
            {pages.length === 0 ? (
              <p className="text-gray-500 text-sm">No pages awaiting review.</p>
            ) : (
              <div className="space-y-3">
                {pages.map(page => (
                  <PageReviewCard key={page.id} page={page} caseId={caseId} onDone={load} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Quote className="w-4 h-4 text-red-400" />
              <h2 className="text-white font-semibold text-sm">Unverified citations ({unverifiedCount})</h2>
            </div>
            {unverifiedCount === 0 ? (
              <p className="text-gray-500 text-sm">Every extracted fact traces to a verified source quote.</p>
            ) : (
              <div className="space-y-2">
                {(unverified?.statements || []).map(s => (
                  <div key={s.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                    <p className="text-gray-200 text-sm">{s.content}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Statement{s.speaker?.canonical_name && ` by ${s.speaker.canonical_name}`}
                      {s.source_file?.filename && ` · ${s.source_file.filename}`}
                      {s.source_quote && <> · claimed quote: <span className="italic">“{s.source_quote}”</span></>}
                    </p>
                  </div>
                ))}
                {(unverified?.relationships || []).map(r => (
                  <div key={r.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                    <p className="text-gray-200 text-sm">
                      {r.from_entity?.canonical_name} — {r.relationship_type} — {r.to_entity?.canonical_name}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Relationship · {r.description}
                      {r.source_quote && <> · claimed quote: <span className="italic">“{r.source_quote}”</span></>}
                    </p>
                  </div>
                ))}
                {(unverified?.timelineEvents || []).map(t => (
                  <div key={t.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                    <p className="text-gray-200 text-sm">{t.description}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Timeline event{t.event_date && ` · ${t.event_date}`}
                      {t.source_file?.filename && ` · ${t.source_file.filename}`}
                      {t.source_quote && <> · claimed quote: <span className="italic">“{t.source_quote}”</span></>}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {(unverified?.mentionCount || 0) > 0 && (
              <p className="text-gray-500 text-xs mt-3 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Plus {unverified!.mentionCount} entity mentions with unverified quotes.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
