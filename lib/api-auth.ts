import { NextRequest } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthContext {
  user: User;
  // Client scoped to the caller's JWT: every query runs under RLS as that
  // user, so the database enforces case ownership even if a route forgets an
  // explicit access check. Routes must use this — never supabaseAdmin, which
  // is reserved for background jobs that have no user context.
  db: SupabaseClient;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthContext | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;

  return { user, db };
}

// Explicit ownership check for a clean 404 before doing work (RLS remains the
// backstop for every query made through ctx.db regardless).
export async function requireCaseAccess(ctx: AuthContext, caseId: string): Promise<boolean> {
  const { data, error } = await ctx.db
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .single();

  return !error && !!data;
}
