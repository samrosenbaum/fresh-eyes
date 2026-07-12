import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

// Human review queue for intake QA: pages the OCR flagged as low confidence,
// and extracted facts whose source quotes could not be verified against any
// page. Humans confirm or correct here before the graph is trusted.

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const [pagesRes, statementsRes, relationshipsRes, eventsRes, mentionsRes] = await Promise.all([
    ctx.db
      .from('document_pages')
      .select('id, file_id, page_number, ocr_text, ocr_confidence, ocr_method, review_status, case_files(filename)')
      .eq('case_id', params.caseId)
      .eq('review_status', 'needs_review')
      .order('ocr_confidence', { ascending: true })
      .limit(100),
    ctx.db
      .from('statements')
      .select('id, content, source_quote, statement_date, speaker:speaker_entity_id(canonical_name), source_file:source_file_id(filename)')
      .eq('case_id', params.caseId)
      .eq('source_verification', 'unverified')
      .limit(100),
    ctx.db
      .from('relationships')
      .select('id, relationship_type, description, source_quote, from_entity:from_entity_id(canonical_name), to_entity:to_entity_id(canonical_name)')
      .eq('case_id', params.caseId)
      .eq('source_verification', 'unverified')
      .limit(100),
    ctx.db
      .from('timeline_events')
      .select('id, description, event_date, source_quote, source_file:source_file_id(filename)')
      .eq('case_id', params.caseId)
      .eq('source_verification', 'unverified')
      .limit(100),
    ctx.db
      .from('entity_mentions')
      .select('id, entities!inner(case_id)', { count: 'exact', head: true })
      .eq('entities.case_id', params.caseId)
      .eq('source_verification', 'unverified'),
  ]);

  return NextResponse.json({
    pages: pagesRes.data || [],
    unverified: {
      statements: statementsRes.data || [],
      relationships: relationshipsRes.data || [],
      timelineEvents: eventsRes.data || [],
      mentionCount: mentionsRes.count || 0,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const body = await req.json();
  const { pageId, ocrText, reviewStatus } = body;
  if (!pageId) return NextResponse.json({ error: 'pageId required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof ocrText === 'string') {
    // Human-corrected transcription supersedes the machine's.
    update.ocr_text = ocrText;
    update.ocr_method = 'human';
    update.ocr_confidence = 1.0;
    update.review_status = 'reviewed';
  }
  if (reviewStatus === 'reviewed' || reviewStatus === 'needs_review' || reviewStatus === 'none') {
    update.review_status = reviewStatus;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await ctx.db
    .from('document_pages')
    .update(update)
    .eq('id', pageId)
    .eq('case_id', params.caseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
