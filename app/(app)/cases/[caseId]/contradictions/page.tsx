'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, AlertTriangle, RefreshCw, Loader2, CheckCircle } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: { color: 'border-red-500/50 bg-red-500/5', badge: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'CRITICAL' },
  high: { color: 'border-orange-500/50 bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'HIGH' },
  medium: { color: 'border-yellow-500/30 bg-yellow-500/5', badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'MEDIUM' },
  low: { color: 'border-[#2a2d3a]', badge: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'LOW' },
};

const TYPE_LABELS: Record<string, string> = {
  alibi_conflict: 'Alibi Conflict',
  timeline_conflict: 'Timeline Conflict',
  statement_conflict: 'Statement Conflict',
  uninterviewed_person: 'Uninterviewed Person',
  missing_followup: 'Missing Follow-up',
  suspicious_omission: 'Suspicious Omission',
  motive_indicator: 'Motive Indicator',
  physical_impossibility: 'Physical Impossibility',
};

const STATUS_ORDER = ['open', 'investigating', 'resolved', 'false_positive'];

export default function ContradictionsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [contradictions, setContradictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState('open');

  async function load() {
    const res = await apiFetch(`/api/cases/${caseId}/contradictions`);
    const data = await res.json();
    const sorted = (data.contradictions || []).sort((a: any, b: any) => {
      const sev = { critical: 4, high: 3, medium: 2, low: 1 };
      return (sev[b.severity as keyof typeof sev] || 0) - (sev[a.severity as keyof typeof sev] || 0);
    });
    setContradictions(sorted);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [caseId]);

  async function runAnalysis() {
    setAnalyzing(true);
    await apiFetch(`/api/cases/${caseId}/analyze`, { method: 'POST' });
    setTimeout(async () => { await load(); setAnalyzing(false); }, 3000);
  }

  async function updateStatus(id: string, status: string) {
    await apiFetch(`/api/cases/${caseId}/contradictions`, {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  const visible = contradictions.filter(c => filter === 'all' || c.status === filter);
  const counts = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: contradictions.filter(c => c.status === s).length }), {} as Record<string, number>);

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contradictions</h1>
          <p className="text-gray-400 mt-1 text-sm">Inconsistencies and anomalies detected by AI analysis</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {analyzing ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[['all', 'All'], ...STATUS_ORDER.map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)])].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === value ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {label}
            {value !== 'all' && counts[value] > 0 && <span className="ml-1.5 text-xs opacity-70">({counts[value]})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>{contradictions.length === 0 ? 'No contradictions detected yet. Upload documents and run analysis.' : 'No items in this category.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(c => {
            const sev = SEVERITY_CONFIG[c.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.low;
            return (
              <div key={c.id} className={`border rounded-xl p-5 ${sev.color}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${sev.badge}`}>{sev.label}</span>
                    {c.type && <span className="text-xs text-gray-500 bg-[#1a1d27] px-2 py-0.5 rounded">{TYPE_LABELS[c.type] || c.type}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.status === 'open' && (
                      <>
                        <button onClick={() => updateStatus(c.id, 'investigating')} className="text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 rounded hover:bg-yellow-400/10 transition-colors">Investigating</button>
                        <button onClick={() => updateStatus(c.id, 'false_positive')} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors">False positive</button>
                      </>
                    )}
                    {c.status === 'investigating' && (
                      <button onClick={() => updateStatus(c.id, 'resolved')} className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-400/10 transition-colors">
                        <CheckCircle className="w-3 h-3" /> Resolved
                      </button>
                    )}
                    {(c.status === 'resolved' || c.status === 'false_positive') && (
                      <button onClick={() => updateStatus(c.id, 'open')} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-white/5 transition-colors">Reopen</button>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-white mb-2">{c.title}</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{c.description}</p>
                {c.evidence?.quotes?.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {c.evidence.quotes.map((q: string, i: number) => (
                      <blockquote key={i} className="text-sm text-gray-400 border-l-2 border-indigo-500/40 pl-3 italic">"{q}"</blockquote>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
