import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await ctx.db
    .from('entities')
    .select(`*, entity_mentions(count)`)
    .eq('case_id', params.caseId)
    .order('role')
    .order('canonical_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entities: data });
}
