import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';
import { mergeEntities } from '@/lib/entity-merge';

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await ctx.db
    .from('entity_merge_proposals')
    .select(`*,
      primary_entity:primary_entity_id(id, canonical_name, aliases, role, type, attributes),
      duplicate_entity:duplicate_entity_id(id, canonical_name, aliases, role, type, attributes)`)
    .eq('case_id', params.caseId)
    .eq('status', 'proposed')
    .order('ai_confidence', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { proposalId, action } = await req.json();
  if (!proposalId || (action !== 'accept' && action !== 'reject')) {
    return NextResponse.json({ error: 'proposalId and action (accept|reject) required' }, { status: 400 });
  }

  const { data: proposal, error: loadError } = await ctx.db
    .from('entity_merge_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('case_id', params.caseId)
    .eq('status', 'proposed')
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });

  const resolved = {
    resolved_by: ctx.user.id,
    resolved_at: new Date().toISOString(),
  };

  if (action === 'reject') {
    const { error } = await ctx.db
      .from('entity_merge_proposals')
      .update({ status: 'rejected', ...resolved })
      .eq('id', proposalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // Accept: execute the merge, keep an audit snapshot on the proposal.
  try {
    const { snapshot } = await mergeEntities(ctx.db, {
      caseId: params.caseId,
      primaryId: proposal.primary_entity_id,
      duplicateId: proposal.duplicate_entity_id,
    });

    const { error } = await ctx.db
      .from('entity_merge_proposals')
      .update({ status: 'accepted', merged_snapshot: snapshot, ...resolved })
      .eq('id', proposalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Other open proposals referencing the now-deleted duplicate are moot.
    // (Rows survive the FK cascade only when the duplicate was the primary of
    // another pair; mark anything still 'proposed' that touches it.)
    await ctx.db
      .from('entity_merge_proposals')
      .update({ status: 'superseded' })
      .eq('case_id', params.caseId)
      .eq('status', 'proposed')
      .or(`primary_entity_id.eq.${proposal.duplicate_entity_id},duplicate_entity_id.eq.${proposal.duplicate_entity_id}`);

    return NextResponse.json({ ok: true, status: 'accepted' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Merge failed' },
      { status: 500 },
    );
  }
}
