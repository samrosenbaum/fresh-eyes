'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewCasePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', description: '', incident_date: '', incident_location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Case name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/cases', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create case'); return; }
      router.push(`/cases/${data.case.id}/documents`);
    } catch {
      setError('Failed to create case');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to cases
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">New Case</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Case Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. John Doe — 1987"
            className="w-full bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief overview of the case..."
            rows={3}
            className="w-full bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Incident Date</label>
            <input
              type="date"
              value={form.incident_date}
              onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
              className="w-full bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Location</label>
            <input
              type="text"
              value={form.incident_location}
              onChange={e => setForm(f => ({ ...f, incident_location: e.target.value }))}
              placeholder="City, State"
              className="w-full bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {saving ? 'Creating...' : 'Create Case'}
        </button>
      </form>
    </div>
  );
}
