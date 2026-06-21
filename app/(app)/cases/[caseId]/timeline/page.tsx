'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft, Clock } from 'lucide-react';

export default function TimelinePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/cases/${caseId}/timeline`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .finally(() => setLoading(false));
  }, [caseId]);

  const grouped = events.reduce((acc, e) => {
    const key = e.event_date || 'Unknown date';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-8 max-w-3xl">
      <Link href={`/cases/${caseId}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to case
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">Timeline</h1>

      {loading ? <div className="text-gray-400">Loading...</div> : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p>No timeline events extracted yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateEvents]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-indigo-400 mb-3">
                {date !== 'Unknown date' ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown Date'}
              </h2>
              <div className="space-y-2 pl-4 border-l border-[#2a2d3a]">
                {(dateEvents as any[]).sort((a, b) => (a.event_time || '').localeCompare(b.event_time || '')).map(event => (
                  <div key={event.id} className="relative pl-4 py-2">
                    <div className="absolute left-[-5px] top-3 w-2 h-2 rounded-full bg-indigo-500/60" />
                    <div className="flex items-center gap-2 mb-1">
                      {event.event_time && <span className="text-xs text-gray-500 font-mono">{event.event_time.slice(0, 5)}</span>}
                      {event.time_precision !== 'exact' && <span className="text-xs text-yellow-500/70">~{event.time_precision}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${event.confidence < 0.7 ? 'bg-yellow-500/10 text-yellow-500/70' : 'bg-green-500/10 text-green-500/70'}`}>
                        {Math.round((event.confidence || 1) * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-white text-sm">{event.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
