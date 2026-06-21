'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FolderOpen, LogOut, Eye } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
      else setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (checking) {
    return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
      <div className="text-gray-400">Loading...</div>
    </div>;
  }

  return (
    <div className="flex min-h-screen bg-[#0f1117]">
      {/* Sidebar */}
      <aside className="w-56 bg-[#12151e] border-r border-[#1e2130] flex flex-col flex-shrink-0">
        <Link href="/" className="flex items-center gap-2 px-4 py-5 border-b border-[#1e2130]">
          <Eye className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-white">FreshEyes</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === '/' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Cases
          </Link>
        </nav>
        <div className="p-3 border-t border-[#1e2130]">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
