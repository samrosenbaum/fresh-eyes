// This file intentionally left as a redirect — actual / page is app/page.tsx
'use client';
import { redirect } from 'next/navigation';
export default function AppIndexPage() { redirect('/'); }

interface Case {
  id: string;
  name: string;
  description: string;
  incident_date: string;
  status: string;
  created_at: string;
  case_files: [{ count: number }];
  entities: [{ count: number }];
  contradictions: [{ count: number }];
}

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    apiFetch('/api/cases')
      .then(r => r.json())
      .then(d => setCases(d.cases || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">Loading cases...</div>;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Cases</h1>
          <p className="text-gray-400 mt-1">Cold case investigation files</p>
        </div>
        <Link
          href="/cases/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Case
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No cases yet. Create your first case to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] hover:border-indigo-500/50 rounded-xl p-5 transition-all group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{c.name}</h2>
                  {(c.contradictions?.[0]?.count || 0) > 0 && (
                    <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                      {c.contradictions[0].count} conflicts
                    </span>
                  )}
                </div>
                {c.description && <p className="text-sm text-gray-400 truncate">{c.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{c.case_files?.[0]?.count || 0} files</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.entities?.[0]?.count || 0} entities</span>
                  {c.incident_date && <span>{new Date(c.incident_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors flex-shrink-0 ml-4" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
