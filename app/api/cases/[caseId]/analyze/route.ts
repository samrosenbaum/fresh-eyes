import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEvent } from '@/lib/inngest';

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await sendEvent('analysis/detect-contradictions', { caseId: params.caseId });
  return NextResponse.json({ ok: true, message: 'Contradiction detection started' });
}
