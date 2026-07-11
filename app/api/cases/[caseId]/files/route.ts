import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEvent } from '@/lib/inngest';

export const maxDuration = 60;

function getSupabaseUser(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return supabase.auth.getUser(token);
}

async function requireCaseAccess(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('created_by', userId)
    .single();

  if (error || !data) return false;
  return true;
}

async function loadIntakeSummary(caseId: string) {
  const [batchesRes, pagesRes] = await Promise.all([
    supabaseAdmin
      .from('import_batches')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('document_pages')
      .select('id, ocr_confidence, duplicate_of_page_id, processing_status')
      .eq('case_id', caseId),
  ]);

  const batches = batchesRes.data || [];
  const pages = pagesRes.data || [];

  return {
    batches,
    pageCount: pages.length,
    lowConfidencePages: pages.filter(page => typeof page.ocr_confidence === 'number' && page.ocr_confidence < 0.75).length,
    duplicatePages: pages.filter(page => page.duplicate_of_page_id).length,
    processingPages: pages.filter(page => page.processing_status === 'pending' || page.processing_status === 'processing').length,
  };
}

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user } } = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(params.caseId, user.id))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('case_files')
    .select('*, import_batches(id, label, status, created_at)')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const intake = await loadIntakeSummary(params.caseId);
  return NextResponse.json({ files: data, intake });
}

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user } } = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(params.caseId, user.id))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const body = await req.json();
  const { filename, storagePath, fileType, fileSize, documentType, importBatchId } = body;

  if (!filename || !storagePath) {
    return NextResponse.json({ error: 'filename and storagePath required' }, { status: 400 });
  }

  let batchId = importBatchId as string | undefined;
  if (!batchId) {
    const { data: batch, error: batchError } = await supabaseAdmin.from('import_batches').insert({
      case_id: params.caseId,
      uploaded_by: user.id,
      label: `Upload ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      status: 'pending',
      file_count: 0,
    }).select('id').single();

    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
    batchId = batch.id;
  }

  const { data: file, error } = await supabaseAdmin.from('case_files').insert({
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

  await supabaseAdmin.from('import_batches').update({ status: 'processing' }).eq('id', batchId);

  // Trigger background processing
  await sendEvent('document/uploaded', {
    caseId: params.caseId,
    fileId: file.id,
    importBatchId: batchId,
    storagePath,
    fileType: fileType || 'unknown',
    documentType: documentType || 'other',
  });

  return NextResponse.json({ file, importBatchId: batchId }, { status: 201 });
}
