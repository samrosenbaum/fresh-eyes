import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ctx.db
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json({ case: data });
}
