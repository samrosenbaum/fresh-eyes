import { generateJson } from '@/lib/ai/provider';
import { buildDocumentSegmentationPrompt } from '@/lib/prompts/document-segmentation';
import {
  buildSegmentationSnippets,
  normalizeSegments,
  DocumentSegment,
  SEGMENTATION_WINDOW_PAGES,
} from '@/lib/intake/segments';

interface RawSegment {
  title?: string;
  document_type?: string;
  start_page?: number;
  end_page?: number;
  confidence?: number;
}

// Detect logical document boundaries inside one uploaded file. Large files
// are segmented in page windows; results are normalized into a guaranteed
// partition of the file's pages.
export async function segmentDocumentPages(input: {
  pages: Array<{ pageNumber: number; text: string | null }>;
  filename: string;
  uploadedDocType: string;
}): Promise<DocumentSegment[]> {
  const pageCount = input.pages.length;
  if (pageCount === 0) return [];

  // Single-page files (photos, one-page tips) need no model call.
  if (pageCount === 1) {
    return normalizeSegments(
      [{ title: input.filename, documentType: input.uploadedDocType, startPage: 1, endPage: 1, confidence: 1 }],
      1,
      input.uploadedDocType,
    );
  }

  const prompt = buildDocumentSegmentationPrompt(input.filename, input.uploadedDocType);
  const proposed: Array<Partial<DocumentSegment>> = [];

  for (let start = 0; start < pageCount; start += SEGMENTATION_WINDOW_PAGES) {
    const window = input.pages.slice(start, start + SEGMENTATION_WINDOW_PAGES);
    const raw = await generateJson<RawSegment[]>({
      profile: 'fast',
      maxTokens: 4096,
      fallback: [],
      prompt: `${prompt}\n\nPage snippets:\n\n${buildSegmentationSnippets(window)}\n\nReturn only the JSON array.`,
      onParseError: payload => {
        console.error('[segment-document] Failed to parse segmentation JSON:', payload.slice(0, 300));
      },
    });

    for (const seg of Array.isArray(raw) ? raw : []) {
      proposed.push({
        title: seg.title,
        documentType: seg.document_type,
        startPage: seg.start_page,
        endPage: seg.end_page,
        confidence: seg.confidence,
      });
    }
  }

  return normalizeSegments(proposed, pageCount, input.uploadedDocType);
}
