import { NextRequest, NextResponse } from 'next/server';
import { sendEvent } from '@/lib/inngest';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await ctx.db
    .from('case_reports')
    .select('*')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data });
}

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  await sendEvent('analysis/generate-report', { caseId: params.caseId });
  return NextResponse.json({ ok: true, message: 'Report generation started' });
}
