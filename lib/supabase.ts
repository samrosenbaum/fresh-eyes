import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

// Browser client (uses anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client (uses service role, bypasses RLS — only use in API routes/jobs)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
