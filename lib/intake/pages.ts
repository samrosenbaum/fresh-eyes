import { supabaseAdmin } from '@/lib/supabase';
import { fingerprintText } from '@/lib/source-verification';
import { LOW_CONFIDENCE_THRESHOLD } from '@/lib/import-batches';

// Page-level intake helpers shared by the background processing jobs.
// Jobs-only module: uses the service-role client (no user context).

// Pages shorter than this (normalized) are too generic to fingerprint-match
// as duplicates (blank pages, cover sheets with one line, etc.).
const MIN_DEDUP_TEXT_LENGTH = 40;

export const IMAGE_MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function downloadFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from('case-files').download(storagePath);
  if (error) throw new Error(`Failed to download file: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Upsert one document_pages row with real per-page text/confidence and
// case-wide duplicate detection via content fingerprint. Low-confidence
// pages enter the human review queue immediately.
export async function storePage(input: {
  caseId: string;
  fileId: string;
  importBatchId?: string | null;
  pageNumber: number;
  text: string;
  confidence: number;
  method: string;
}) {
  const normalizedLength = input.text.replace(/\s+/g, ' ').trim().length;
  const pageFingerprint = fingerprintText(input.text);

  let duplicateOfPageId: string | null = null;
  if (normalizedLength >= MIN_DEDUP_TEXT_LENGTH) {
    const { data: duplicate } = await supabaseAdmin
      .from('document_pages')
      .select('id')
      .eq('case_id', input.caseId)
      .eq('page_fingerprint', pageFingerprint)
      .neq('file_id', input.fileId)
      .limit(1)
      .maybeSingle();
    duplicateOfPageId = duplicate?.id || null;
  }

  const { error } = await supabaseAdmin.from('document_pages').upsert({
    case_id: input.caseId,
    file_id: input.fileId,
    import_batch_id: input.importBatchId || null,
    page_number: input.pageNumber,
    ocr_text: input.text,
    ocr_confidence: input.confidence,
    ocr_method: input.method,
    page_fingerprint: pageFingerprint,
    duplicate_of_page_id: duplicateOfPageId,
    processing_status: 'complete',
    review_status: input.confidence < LOW_CONFIDENCE_THRESHOLD ? 'needs_review' : 'none',
  }, { onConflict: 'file_id,page_number' });

  if (error) throw new Error(`Failed to store page ${input.pageNumber}: ${error.message}`);
}

export async function loadStoredPages(fileId: string) {
  const { data, error } = await supabaseAdmin
    .from('document_pages')
    .select('id, page_number, ocr_text')
    .eq('file_id', fileId)
    .order('page_number', { ascending: true });

  if (error) throw new Error(`Failed to load stored pages: ${error.message}`);
  return data || [];
}

// Extract page `pageIndex` (0-based) of a PDF as a standalone one-page PDF so
// vision OCR sees exactly one source page.
export async function extractSinglePagePdf(sourceBuffer: Buffer, pageIndex: number): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(new Uint8Array(sourceBuffer), { ignoreEncryption: true });
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(source, [pageIndex]);
  single.addPage(page);
  return Buffer.from(await single.save());
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
  return doc.getPageCount();
}
