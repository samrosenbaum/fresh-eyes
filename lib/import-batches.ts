import { SupabaseClient } from '@supabase/supabase-js';

// All helpers take an explicit Supabase client: API routes pass the caller's
// RLS-scoped client (lib/api-auth.ts), background jobs pass supabaseAdmin.

// Pages below this OCR confidence are flagged for review in intake QA.
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export interface ImportBatchStats {
  fileCount: number;
  completedFileCount: number;
  failedFileCount: number;
  pageCount: number;
  lowConfidencePageCount: number;
  duplicatePageCount: number;
}

export const EMPTY_BATCH_STATS: ImportBatchStats = {
  fileCount: 0,
  completedFileCount: 0,
  failedFileCount: 0,
  pageCount: 0,
  lowConfidencePageCount: 0,
  duplicatePageCount: 0,
};

export async function createImportBatch(db: SupabaseClient, input: {
  caseId: string;
  userId: string;
  label?: string;
}) {
  const label = input.label?.trim()
    || `Upload ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const { data, error } = await db.from('import_batches').insert({
    case_id: input.caseId,
    uploaded_by: input.userId,
    label,
    status: 'pending',
    file_count: 0,
  }).select().single();

  if (error) throw new Error(`Failed to create import batch: ${error.message}`);
  return data;
}

// Live per-batch rollups computed from case_files/document_pages so the UI
// stays accurate while a batch is mid-processing (the stored counts on
// import_batches are only finalized by the processing job).
export async function loadBatchStatsForCase(db: SupabaseClient, caseId: string): Promise<Record<string, ImportBatchStats>> {
  const [filesRes, pagesRes] = await Promise.all([
    db
      .from('case_files')
      .select('id, import_batch_id, processing_status')
      .eq('case_id', caseId),
    db
      .from('document_pages')
      .select('id, import_batch_id, ocr_confidence, duplicate_of_page_id')
      .eq('case_id', caseId),
  ]);

  const stats: Record<string, ImportBatchStats> = {};
  const statsFor = (batchId: string) => {
    stats[batchId] ||= { ...EMPTY_BATCH_STATS };
    return stats[batchId];
  };

  for (const file of filesRes.data || []) {
    if (!file.import_batch_id) continue;
    const s = statsFor(file.import_batch_id);
    s.fileCount++;
    if (file.processing_status === 'complete') s.completedFileCount++;
    if (file.processing_status === 'failed') s.failedFileCount++;
  }

  for (const page of pagesRes.data || []) {
    if (!page.import_batch_id) continue;
    const s = statsFor(page.import_batch_id);
    s.pageCount++;
    if (typeof page.ocr_confidence === 'number' && page.ocr_confidence < LOW_CONFIDENCE_THRESHOLD) {
      s.lowConfidencePageCount++;
    }
    if (page.duplicate_of_page_id) s.duplicatePageCount++;
  }

  return stats;
}

// Recompute and persist a batch's rolled-up counts and status. Called by the
// processing job after each file completes or fails so the batch never hangs
// in 'processing' forever.
export async function updateImportBatchRollup(db: SupabaseClient, caseId: string, batchId: string) {
  const stats = (await loadBatchStatsForCase(db, caseId))[batchId] || { ...EMPTY_BATCH_STATS };

  const done = stats.fileCount > 0
    && stats.completedFileCount + stats.failedFileCount === stats.fileCount;
  const status = !done ? 'processing' : stats.failedFileCount > 0 ? 'failed' : 'complete';

  await db.from('import_batches').update({
    status,
    file_count: stats.fileCount,
    page_count: stats.pageCount,
    low_confidence_page_count: stats.lowConfidencePageCount,
    duplicate_page_count: stats.duplicatePageCount,
    error: done && stats.failedFileCount > 0
      ? `${stats.failedFileCount} of ${stats.fileCount} files failed processing`
      : null,
    completed_at: done ? new Date().toISOString() : null,
  }).eq('id', batchId);
}
