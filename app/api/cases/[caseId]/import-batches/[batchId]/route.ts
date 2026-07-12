import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';
import { LOW_CONFIDENCE_THRESHOLD } from '@/lib/import-batches';

export async function GET(
  req: NextRequest,
  { params }: { params: { caseId: string; batchId: string } },
) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data: batch, error: batchError } = await ctx.db
    .from('import_batches')
    .select('*')
    .eq('id', params.batchId)
    .eq('case_id', params.caseId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
  }

  const [filesRes, pagesRes] = await Promise.all([
    ctx.db
      .from('case_files')
      .select('id, filename, document_type, file_type, file_size, page_count, processing_status, processing_error, created_at')
      .eq('import_batch_id', params.batchId)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('document_pages')
      .select('id, file_id, page_number, ocr_confidence, ocr_method, duplicate_of_page_id, processing_status')
      .eq('import_batch_id', params.batchId)
      .order('page_number', { ascending: true }),
  ]);

  if (filesRes.error) return NextResponse.json({ error: filesRes.error.message }, { status: 500 });
  if (pagesRes.error) return NextResponse.json({ error: pagesRes.error.message }, { status: 500 });

  const pages = pagesRes.data || [];

  return NextResponse.json({
    batch,
    files: filesRes.data || [],
    pages,
    qa: {
      pageCount: pages.length,
      lowConfidencePages: pages.filter(
        p => typeof p.ocr_confidence === 'number' && p.ocr_confidence < LOW_CONFIDENCE_THRESHOLD,
      ),
      duplicatePages: pages.filter(p => p.duplicate_of_page_id),
    },
  });
}
