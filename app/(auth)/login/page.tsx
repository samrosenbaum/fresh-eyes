'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') router.push('/');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">FreshEyes</h1>
        <p className="text-gray-400">Cold Case Intelligence Platform</p>
      </div>
      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-8">
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#6366f1',
                  brandAccent: '#4f46e5',
                  inputBackground: '#0f1117',
                  inputBorder: '#2a2d3a',
                  inputText: '#e8eaf0',
                },
              },
            },
          }}
          providers={[]}
          redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/`}
        />
      </div>
    </div>
  );
}
