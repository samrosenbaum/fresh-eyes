import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

// The gap engine. Deliberately not AI: every gap is a query over structured,
// source-cited data, so an investigator can defend "this evidence has no
// located result" by pointing at rows, not model output.

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const [evidenceRes, testsRes, loopsRes, peopleRes, speakersRes] = await Promise.all([
    ctx.db
      .from('evidence_items')
      .select('id, label, category, description, status, collected_date, collected_location, source_quote, source_verification, source_file:source_file_id(filename)')
      .eq('case_id', params.caseId)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('evidence_tests')
      .select('id, evidence_item_id, test_type, result_summary, tested_date, lab_name')
      .eq('case_id', params.caseId),
    ctx.db
      .from('open_loops')
      .select('id, description, loop_type, raised_date, status, source_quote, source_verification, source_file:source_file_id(filename)')
      .eq('case_id', params.caseId)
      .eq('status', 'open')
      .order('raised_date', { ascending: true }),
    ctx.db
      .from('entities')
      .select('id, canonical_name, role, aliases, entity_mentions(count)')
      .eq('case_id', params.caseId)
      .eq('type', 'person'),
    ctx.db
      .from('statements')
      .select('speaker_entity_id')
      .eq('case_id', params.caseId)
      .not('speaker_entity_id', 'is', null),
  ]);

  const tests = testsRes.data || [];
  const testsByItem = new Map<string, typeof tests>();
  for (const test of tests) {
    const list = testsByItem.get(test.evidence_item_id) || [];
    list.push(test);
    testsByItem.set(test.evidence_item_id, list);
  }

  const evidence = (evidenceRes.data || []).map(item => ({
    ...item,
    tests: testsByItem.get(item.id) || [],
  }));

  // Evidence with no located result — the classic cold-case retest list.
  const untestedEvidence = evidence.filter(
    item => item.tests.length === 0 && item.status !== 'tested',
  );

  // People who keep appearing in the file but were never interviewed
  // (no statement attributed to them).
  const speakerIds = new Set((speakersRes.data || []).map(s => s.speaker_entity_id));
  const MENTION_FLOOR = 2;
  const unstatementedPeople = (peopleRes.data || [])
    .map(person => ({
      id: person.id,
      canonical_name: person.canonical_name,
      role: person.role,
      aliases: person.aliases || [],
      mentionCount: person.entity_mentions?.[0]?.count || 0,
    }))
    .filter(person => person.mentionCount >= MENTION_FLOOR && !speakerIds.has(person.id))
    .sort((a, b) => b.mentionCount - a.mentionCount);

  return NextResponse.json({
    untestedEvidence,
    openLoops: loopsRes.data || [],
    unstatementedPeople,
    evidenceInventory: evidence,
    summary: {
      evidenceCount: evidence.length,
      untestedEvidenceCount: untestedEvidence.length,
      openLoopCount: (loopsRes.data || []).length,
      unstatementedPeopleCount: unstatementedPeople.length,
    },
  });
}

// Mark an open loop resolved / not a lead after human review.
export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { loopId, status, resolutionNotes } = await req.json();
  if (!loopId || !['open', 'resolved', 'not_a_lead'].includes(status)) {
    return NextResponse.json({ error: 'loopId and status (open|resolved|not_a_lead) required' }, { status: 400 });
  }

  const { error } = await ctx.db
    .from('open_loops')
    .update({ status, resolution_notes: resolutionNotes || null })
    .eq('id', loopId)
    .eq('case_id', params.caseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
