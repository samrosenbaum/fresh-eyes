import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { sendEvent } from '@/lib/inngest';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';
import { createImportBatch, LOW_CONFIDENCE_THRESHOLD } from '@/lib/import-batches';

export const maxDuration = 60;

async function loadIntakeSummary(db: SupabaseClient, caseId: string) {
  const [batchesRes, pagesRes, documentsRes] = await Promise.all([
    db
      .from('import_batches')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
    db
      .from('document_pages')
      .select('id, ocr_confidence, duplicate_of_page_id, processing_status')
      .eq('case_id', caseId),
    db
      .from('case_documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId),
  ]);

  const batches = batchesRes.data || [];
  const pages = pagesRes.data || [];

  return {
    batches,
    pageCount: pages.length,
    documentsDetected: documentsRes.count || 0,
    lowConfidencePages: pages.filter(page => typeof page.ocr_confidence === 'number' && page.ocr_confidence < LOW_CONFIDENCE_THRESHOLD).length,
    duplicatePages: pages.filter(page => page.duplicate_of_page_id).length,
    processingPages: pages.filter(page => page.processing_status === 'pending' || page.processing_status === 'processing').length,
  };
}

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await ctx.db
    .from('case_files')
    .select('*, import_batches(id, label, status, created_at)')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const intake = await loadIntakeSummary(ctx.db, params.caseId);
  return NextResponse.json({ files: data, intake });
}

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const body = await req.json();
  const { filename, storagePath, fileType, fileSize, documentType, importBatchId } = body;

  if (!filename || !storagePath) {
    return NextResponse.json({ error: 'filename and storagePath required' }, { status: 400 });
  }

  let batchId = importBatchId as string | undefined;
  if (batchId) {
    // The batch must belong to this case — reject cross-case attachment.
    const { data: batch } = await ctx.db
      .from('import_batches')
      .select('id')
      .eq('id', batchId)
      .eq('case_id', params.caseId)
      .single();
    if (!batch) return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
  } else {
    try {
      const batch = await createImportBatch(ctx.db, { caseId: params.caseId, userId: ctx.user.id });
      batchId = batch.id;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create batch' }, { status: 500 });
    }
  }

  const { data: file, error } = await ctx.db.from('case_files').insert({
    case_id: params.caseId,
    import_batch_id: batchId,
    filename,
    storage_path: storagePath,
    file_type: fileType || 'unknown',
    file_size: fileSize,
    document_type: documentType || 'other',
    processing_status: 'pending',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from('import_batches').update({ status: 'processing' }).eq('id', batchId);

  // Trigger background processing
  await sendEvent('document/uploaded', {
    caseId: params.caseId,
    fileId: file.id,
    importBatchId: batchId!,
    storagePath,
    fileType: fileType || 'unknown',
    documentType: documentType || 'other',
  });

  return NextResponse.json({ file, importBatchId: batchId }, { status: 201 });
}
