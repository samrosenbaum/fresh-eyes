'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, FlaskConical, ListTodo, UserX, Package, CheckCircle, XCircle } from 'lucide-react';

function Citation({ item }: { item: any }) {
  if (!item.source_quote && !item.source_file?.filename) return null;
  return (
    <p className="text-gray-500 text-xs mt-1">
      {item.source_file?.filename && <span>{item.source_file.filename}</span>}
      {item.source_quote && <span className="italic"> · “{item.source_quote}”</span>}
      {item.source_verification === 'verified' && <span className="text-green-500/80"> · verified</span>}
    </p>
  );
}

export default function GapsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/cases/${caseId}/gaps`);
    setData(await res.json());
  }, [caseId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function resolveLoop(loopId: string, status: 'resolved' | 'not_a_lead') {
    const res = await apiFetch(`/api/cases/${caseId}/gaps`, {
      method: 'PATCH',
      body: JSON.stringify({ loopId, status }),
    });
    if (res.ok) await load();
  }

  if (loading) return <div className="p-8 text-gray-400">Loading gaps...</div>;

  const summary = data?.summary || {};

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Investigative Gaps</h1>
        <p className="text-gray-400 text-sm mt-1">
          Computed from the case graph — every gap traces to source documents, not model opinion.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><FlaskConical className="w-3.5 h-3.5" /> Untested evidence</div>
          <div className="text-2xl font-bold text-white mt-2">{summary.untestedEvidenceCount || 0}<span className="text-sm text-gray-500 font-normal"> of {summary.evidenceCount || 0} items</span></div>
        </div>
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><ListTodo className="w-3.5 h-3.5" /> Open loops</div>
          <div className="text-2xl font-bold text-white mt-2">{summary.openLoopCount || 0}</div>
        </div>
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide"><UserX className="w-3.5 h-3.5" /> No statement on file</div>
          <div className="text-2xl font-bold text-white mt-2">{summary.unstatementedPeopleCount || 0}</div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-yellow-400" /> Evidence with no located test result
          </h2>
          {(data?.untestedEvidence || []).length === 0 ? (
            <p className="text-gray-500 text-sm">Every inventoried evidence item has a located result.</p>
          ) : (
            <div className="space-y-2">
              {data.untestedEvidence.map((item: any) => (
                <div key={item.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <p className="text-white text-sm font-medium truncate">{item.label}</p>
                    </div>
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full capitalize flex-shrink-0">{item.status}</span>
                  </div>
                  {item.description && <p className="text-gray-400 text-xs mt-1">{item.description}</p>}
                  <Citation item={item} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-blue-400" /> Promised actions with no located follow-up
          </h2>
          {(data?.openLoops || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No open loops.</p>
          ) : (
            <div className="space-y-2">
              {data.openLoops.map((loop: any) => (
                <div key={loop.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-white text-sm">{loop.description}</p>
                    <span className="text-xs text-gray-500 capitalize flex-shrink-0">{(loop.loop_type || '').replace(/_/g, ' ')}{loop.raised_date && ` · ${loop.raised_date}`}</span>
                  </div>
                  <Citation item={loop} />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => resolveLoop(loop.id, 'resolved')}
                      className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" /> Was followed up
                    </button>
                    <button
                      onClick={() => resolveLoop(loop.id, 'not_a_lead')}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <XCircle className="w-3 h-3" /> Not a lead
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <UserX className="w-4 h-4 text-purple-400" /> Mentioned repeatedly, no statement on file
          </h2>
          {(data?.unstatementedPeople || []).length === 0 ? (
            <p className="text-gray-500 text-sm">Everyone mentioned repeatedly has a statement on file.</p>
          ) : (
            <div className="space-y-2">
              {data.unstatementedPeople.map((person: any) => (
                <div key={person.id} className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{person.canonical_name}</p>
                    {person.aliases?.length > 0 && <p className="text-gray-500 text-xs">Also: {person.aliases.join(', ')}</p>}
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0 capitalize">{person.role} · {person.mentionCount} mentions</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
