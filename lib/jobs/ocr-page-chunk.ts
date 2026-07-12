import { inngest } from '@/lib/inngest';
import { transcribeImagePage, transcribePdfPage } from '@/lib/ai/tasks/ocr';
import {
  downloadFile,
  extractSinglePagePdf,
  storePage,
  IMAGE_MEDIA_TYPES,
} from '@/lib/intake/pages';

export interface OcrPageChunkInput {
  caseId: string;
  fileId: string;
  importBatchId?: string | null;
  storagePath: string;
  kind: 'pdf-scan' | 'image';
  // 1-based inclusive page range within the file
  startPage: number;
  endPage: number;
}

// Vision-OCRs one small range of pages from one file. Invoked in parallel by
// process-document via step.invoke, so a thousand-page scan fans out across
// many concurrent runs instead of crawling through one.
export const ocrPageChunkJob = inngest.createFunction(
  {
    id: 'ocr-page-chunk',
    name: 'OCR Page Chunk',
    retries: 2,
    concurrency: { limit: 8 },
    triggers: { event: 'intake/ocr-page-chunk' },
  },
  async ({ event, step }) => {
    const input = event.data as OcrPageChunkInput;

    const pageConfidences = await step.run(`ocr-${input.startPage}-${input.endPage}`, async () => {
      const buffer = await downloadFile(input.storagePath);
      const results: Array<{ pageNumber: number; confidence: number }> = [];

      for (let pageNumber = input.startPage; pageNumber <= input.endPage; pageNumber++) {
        const result = input.kind === 'image'
          ? await transcribeImagePage({
              imageBuffer: buffer,
              mediaType: IMAGE_MEDIA_TYPES[input.storagePath.split('.').pop()?.toLowerCase() || ''] || 'image/jpeg',
            })
          : await transcribePdfPage({ pdfBuffer: await extractSinglePagePdf(buffer, pageNumber - 1) });

        await storePage({
          caseId: input.caseId,
          fileId: input.fileId,
          importBatchId: input.importBatchId,
          pageNumber,
          text: result.text,
          confidence: result.confidence,
          method: 'ai-vision',
        });

        results.push({ pageNumber, confidence: result.confidence });
      }

      return results;
    });

    return { fileId: input.fileId, pages: pageConfidences };
  }
);
