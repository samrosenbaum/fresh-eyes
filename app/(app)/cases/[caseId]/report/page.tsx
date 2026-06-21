'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, FileSearch, Loader2, RefreshCw } from 'lucide-react';

function MarkdownReport({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-invert max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-white mt-8 mb-3 border-b border-[#2a2d3a] pb-2">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-indigo-300 mt-6 mb-2">{line.slice(4)}</h3>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-white mt-4 mb-4">{line.slice(2)}</h1>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="text-gray-300 ml-4 my-1">{line.slice(2)}</li>;
        if (line.match(/^\d+\. /)) return <li key={i} className="text-gray-300 ml-4 my-1">{line.replace(/^\d+\. /, '')}</li>;
        if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-indigo-500/40 pl-4 text-gray-400 italic my-2">{line.slice(2)}</blockquote>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
        return <p key={i} className="text-gray-300 leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
      })}
    </div>
  );
}

export default function ReportPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadReport = useCallback(async () => {
    const res = await apiFetch(`/api/cases/${caseId}/report`);
    const data = await res.json();
    setReport(data.report);
  }, [caseId]);

  useEffect(() => { loadReport().finally(() => setLoading(false)); }, [loadReport]);

  async function generateReport() {
    setGenerating(true);
    await apiFetch(`/api/cases/${caseId}/report`, { method: 'POST' });
    let attempts = 0;
    const prevId = report?.id;
    const poll = setInterval(async () => {
      const res = await apiFetch(`/api/cases/${caseId}/report`);
      const data = await res.json();
      if (data.report && data.report.id !== prevId) {
        setReport(data.report);
        clearInterval(poll);
        setGenerating(false);
      }
      if (++attempts > 60) { clearInterval(poll); setGenerating(false); }
    }, 5000);
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Investigation Report</h1>
          <p className="text-gray-400 mt-1 text-sm">AI-generated briefing for investigative teams</p>
        </div>
        <button
          onClick={generateReport}
          disabled={generating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {generating ? 'Generating...' : report ? 'Regenerate' : 'Generate Report'}
        </button>
      </div>

      {generating && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-6 mb-6 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin flex-shrink-0" />
          <div>
            <p className="text-indigo-300 font-medium">Generating investigation report...</p>
            <p className="text-indigo-400/70 text-sm mt-0.5">Claude is analyzing all case data. This takes 1-3 minutes.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : !report ? (
        <div className="text-center py-20 text-gray-500">
          <FileSearch className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg mb-2">No report generated yet</p>
          <p className="text-sm">Upload documents, run contradiction analysis, then generate a report.</p>
        </div>
      ) : (
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-8">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[#2a2d3a] text-xs text-gray-500">
            <span>Generated {new Date(report.created_at).toLocaleString()}</span>
            {report.files_analyzed && <span>{report.files_analyzed} files analyzed</span>}
            {report.entities_found && <span>{report.entities_found} entities</span>}
            {report.contradictions_found && <span>{report.contradictions_found} contradictions</span>}
          </div>
          <MarkdownReport content={report.content} />
        </div>
      )}
    </div>
  );
}
