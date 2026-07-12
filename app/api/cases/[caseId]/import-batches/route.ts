import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';
import { createImportBatch, loadBatchStatsForCase, EMPTY_BATCH_STATS } from '@/lib/import-batches';

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const [batchesRes, stats] = await Promise.all([
    ctx.db
      .from('import_batches')
      .select('*')
      .eq('case_id', params.caseId)
      .order('created_at', { ascending: false }),
    loadBatchStatsForCase(ctx.db, params.caseId),
  ]);

  if (batchesRes.error) return NextResponse.json({ error: batchesRes.error.message }, { status: 500 });

  const batches = (batchesRes.data || []).map(batch => ({
    ...batch,
    stats: stats[batch.id] || { ...EMPTY_BATCH_STATS },
  }));

  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const batch = await createImportBatch(ctx.db, {
      caseId: params.caseId,
      userId: ctx.user.id,
      label: typeof body.label === 'string' ? body.label : undefined,
    });
    return NextResponse.json({ batch }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create batch' }, { status: 500 });
  }
}
