'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, User, MapPin, Building, Car, Package, GitMerge, Loader2, Check, X } from 'lucide-react';

const TYPE_ICONS: Record<string, any> = { person: User, location: MapPin, organization: Building, vehicle: Car, evidence_item: Package };
const ROLE_COLORS: Record<string, string> = {
  victim: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  suspect: 'bg-red-500/20 text-red-400 border-red-500/30',
  witness: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  investigator: 'bg-green-500/20 text-green-400 border-green-500/30',
  mentioned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function EntitySummary({ entity }: { entity: any }) {
  return (
    <div className="flex-1 min-w-0 bg-[#12141c] border border-[#2a2d3a] rounded-lg p-3">
      <p className="text-white text-sm font-semibold truncate">{entity?.canonical_name || '(deleted)'}</p>
      {entity?.aliases?.length > 0 && <p className="text-gray-500 text-xs mt-0.5 truncate">Also: {entity.aliases.join(', ')}</p>}
      <div className="flex flex-wrap gap-2 mt-1">
        {entity?.role && <span className="text-xs text-gray-400 capitalize">{entity.role}</span>}
        {Object.entries(entity?.attributes || {}).filter(([, v]) => v).slice(0, 3).map(([k, v]) => (
          <span key={k} className="text-xs text-gray-500">{k.replace(/_/g, ' ')}: {String(v)}</span>
        ))}
      </div>
    </div>
  );
}

function ProposalCard({ proposal, caseId, onResolved }: { proposal: any; caseId: string; onResolved: () => void }) {
  const [acting, setActing] = useState(false);

  async function decide(action: 'accept' | 'reject') {
    setActing(true);
    try {
      const res = await apiFetch(`/api/cases/${caseId}/merge-proposals`, {
        method: 'PATCH',
        body: JSON.stringify({ proposalId: proposal.id, action }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Failed: ' + (data.error || 'Unknown error')); return; }
      onResolved();
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="bg-[#1a1d27] border border-indigo-500/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-full">
          {proposal.ai_verdict === 'same' ? 'Likely the same' : 'Possibly the same'}
          {typeof proposal.ai_confidence === 'number' && ` · ${Math.round(proposal.ai_confidence * 100)}%`}
        </span>
        <span className="text-xs text-gray-600">{(proposal.signals || []).join(', ')}</span>
      </div>
      <div className="flex items-stretch gap-3 mb-3">
        <EntitySummary entity={proposal.primary_entity} />
        <div className="flex items-center text-gray-600"><GitMerge className="w-4 h-4" /></div>
        <EntitySummary entity={proposal.duplicate_entity} />
      </div>
      {proposal.ai_reasoning && <p className="text-gray-400 text-xs mb-3">{proposal.ai_reasoning}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={() => decide('accept')}
          disabled={acting}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Merge — same {proposal.primary_entity?.type || 'entity'}
        </button>
        <button
          onClick={() => decide('reject')}
          disabled={acting}
          className="flex items-center gap-1.5 bg-[#2a2d3a] hover:bg-[#343849] disabled:opacity-50 text-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          <X className="w-3 h-3" />
          Keep separate
        </button>
      </div>
    </div>
  );
}

export default function EntitiesPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [entities, setEntities] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const scanPollRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    const [entitiesRes, proposalsRes] = await Promise.all([
      apiFetch(`/api/cases/${caseId}/entities`),
      apiFetch(`/api/cases/${caseId}/merge-proposals`),
    ]);
    const entitiesData = await entitiesRes.json();
    const proposalsData = await proposalsRes.json();
    setEntities(entitiesData.entities || []);
    setProposals(proposalsData.proposals || []);
  }, [caseId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    return () => { if (scanPollRef.current) clearInterval(scanPollRef.current); };
  }, [load]);

  async function findDuplicates() {
    setScanning(true);
    const res = await apiFetch(`/api/cases/${caseId}/resolve`, { method: 'POST' });
    if (!res.ok) { setScanning(false); alert('Failed to start entity resolution'); return; }

    // Poll for new proposals while the background pass runs (~90s max).
    let polls = 0;
    scanPollRef.current = setInterval(async () => {
      polls++;
      await load();
      if (polls >= 18) {
        if (scanPollRef.current) clearInterval(scanPollRef.current);
        scanPollRef.current = null;
        setScanning(false);
      }
    }, 5000);
  }

  const types = ['all', ...Array.from(new Set(entities.map(e => e.type)))];
  const visible = typeFilter === 'all' ? entities : entities.filter(e => e.type === typeFilter);
  const grouped = visible.reduce((acc, e) => {
    const key = e.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Persons & Entities</h1>
        <button
          onClick={findDuplicates}
          disabled={scanning || entities.length < 2}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
          {scanning ? 'Scanning for duplicates...' : 'Find duplicates'}
        </button>
      </div>

      {proposals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <GitMerge className="w-4 h-4" /> Possible duplicates ({proposals.length})
          </h2>
          <div className="space-y-3">
            {proposals.map(p => (
              <ProposalCard key={p.id} proposal={p} caseId={caseId} onResolved={load} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {types.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              typeFilter === t ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <div className="text-gray-400">Loading...</div> : visible.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <User className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p>No entities extracted yet. Upload and process documents first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = TYPE_ICONS[type] || User;
            return (
              <div key={type}>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Icon className="w-4 h-4" />{type}s
                </h2>
                <div className="space-y-2">
                  {(items as any[]).map(entity => (
                    <div key={entity.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">{entity.canonical_name}</span>
                            {entity.role && entity.type === 'person' && (
                              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ROLE_COLORS[entity.role] || ROLE_COLORS.mentioned}`}>
                                {entity.role}
                              </span>
                            )}
                          </div>
                          {entity.aliases?.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">Also: {entity.aliases.join(', ')}</p>
                          )}
                          {entity.attributes && Object.keys(entity.attributes).length > 0 && (
                            <div className="flex flex-wrap gap-3 mt-2">
                              {Object.entries(entity.attributes).filter(([, v]) => v).slice(0, 5).map(([k, v]) => (
                                <span key={k} className="text-xs text-gray-400">
                                  <span className="text-gray-600">{k.replace(/_/g, ' ')}: </span>{String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                          {entity.notes && <p className="text-sm text-gray-400 mt-2">{entity.notes}</p>}
                        </div>
                        <span className="text-xs text-gray-600 flex-shrink-0">
                          {entity.entity_mentions?.[0]?.count || 0} mentions
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
