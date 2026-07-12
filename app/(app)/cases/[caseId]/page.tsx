'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { FileText, Users, AlertTriangle, Clock, FileSearch, ChevronRight, FlaskConical } from 'lucide-react';

export default function CaseOverviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseData, setCaseData] = useState<any>(null);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/cases/${caseId}`).then(r => r.json()),
      apiFetch(`/api/cases/${caseId}/files`).then(r => r.json()),
      apiFetch(`/api/cases/${caseId}/entities`).then(r => r.json()),
      apiFetch(`/api/cases/${caseId}/contradictions`).then(r => r.json()),
    ]).then(([caseRes, filesRes, entitiesRes, contradictionsRes]) => {
      setCaseData(caseRes.case);
      const files = filesRes.files || [];
      const pending = files.filter((f: any) => f.processing_status === 'pending' || f.processing_status === 'processing').length;
      setStats({
        files: files.length,
        pending,
        entities: (entitiesRes.entities || []).length,
        contradictions: (contradictionsRes.contradictions || []).filter((c: any) => c.status === 'open').length,
        critical: (contradictionsRes.contradictions || []).filter((c: any) => c.severity === 'critical' && c.status === 'open').length,
      });
    }).finally(() => setLoading(false));
  }, [caseId]);

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!caseData) return <div className="p-8 text-red-400">Case not found</div>;

  const navItems = [
    { href: `/cases/${caseId}/documents`, label: 'Documents', icon: FileText, count: stats.files, badge: stats.pending ? `${stats.pending} processing` : null },
    { href: `/cases/${caseId}/entities`, label: 'Persons & Entities', icon: Users, count: stats.entities },
    { href: `/cases/${caseId}/contradictions`, label: 'Contradictions', icon: AlertTriangle, count: stats.contradictions, badge: stats.critical ? `${stats.critical} critical` : null, badgeColor: 'red' },
    { href: `/cases/${caseId}/timeline`, label: 'Timeline', icon: Clock },
    { href: `/cases/${caseId}/gaps`, label: 'Investigative Gaps', icon: FlaskConical },
    { href: `/cases/${caseId}/report`, label: 'Investigation Report', icon: FileSearch },
  ];

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{caseData.name}</h1>
        {caseData.description && <p className="text-gray-400 mt-1">{caseData.description}</p>}
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          {caseData.incident_date && <span>{new Date(caseData.incident_date).toLocaleDateString()}</span>}
          {caseData.incident_location && <span>{caseData.incident_location}</span>}
        </div>
      </div>

      <div className="space-y-2">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between bg-[#1a1d27] border border-[#2a2d3a] hover:border-indigo-500/50 rounded-xl p-4 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#12151e] flex items-center justify-center">
                <item.icon className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="font-medium text-white group-hover:text-indigo-300 transition-colors">{item.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.count !== undefined && <span className="text-xs text-gray-500">{item.count} {item.count === 1 ? 'item' : 'items'}</span>}
                  {item.badge && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.badgeColor === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
