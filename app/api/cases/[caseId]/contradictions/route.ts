import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await ctx.db
    .from('contradictions')
    .select('*')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contradictions: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { id, status, resolution_notes } = await req.json();
  const { error } = await ctx.db.from('contradictions')
    .update({ status, resolution_notes })
    .eq('id', id)
    .eq('case_id', params.caseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
