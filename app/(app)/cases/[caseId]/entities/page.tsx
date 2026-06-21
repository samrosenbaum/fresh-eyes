'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, User, MapPin, Building, Car, Package } from 'lucide-react';

const TYPE_ICONS: Record<string, any> = { person: User, location: MapPin, organization: Building, vehicle: Car, evidence_item: Package };
const ROLE_COLORS: Record<string, string> = {
  victim: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  suspect: 'bg-red-500/20 text-red-400 border-red-500/30',
  witness: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  investigator: 'bg-green-500/20 text-green-400 border-green-500/30',
  mentioned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function EntitiesPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    apiFetch(`/api/cases/${caseId}/entities`)
      .then(r => r.json())
      .then(d => setEntities(d.entities || []))
      .finally(() => setLoading(false));
  }, [caseId]);

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
      <h1 className="text-2xl font-bold text-white mb-6">Persons & Entities</h1>

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
