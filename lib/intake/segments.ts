// Pure logic for normalizing AI-proposed document boundaries into a clean
// partition of a file's pages. The model proposes segments; this guarantees
// the invariants downstream code relies on: sorted, non-overlapping,
// in-bounds, and covering every page exactly once.

export interface DocumentSegment {
  title: string;
  documentType: string;
  startPage: number;
  endPage: number;
  confidence: number;
}

export const SEGMENT_DOCUMENT_TYPES = [
  'police_report',
  'witness_statement',
  'interview',
  'autopsy',
  'evidence_log',
  'lab_report',
  'tip',
  'photo',
  'other',
] as const;

function clampConfidence(value: unknown): number {
  return typeof value === 'number' ? Math.min(1, Math.max(0, value)) : 0.5;
}

export function normalizeSegments(
  raw: Array<Partial<DocumentSegment>>,
  pageCount: number,
  fallbackType = 'other',
): DocumentSegment[] {
  if (pageCount < 1) return [];

  const candidates = raw
    .map(seg => ({
      title: (seg.title || '').trim() || 'Untitled document',
      documentType: SEGMENT_DOCUMENT_TYPES.includes(seg.documentType as any) ? seg.documentType! : fallbackType,
      startPage: Math.max(1, Math.min(pageCount, Math.round(seg.startPage ?? 0))),
      endPage: Math.max(1, Math.min(pageCount, Math.round(seg.endPage ?? 0))),
      confidence: clampConfidence(seg.confidence),
    }))
    .filter(seg => seg.startPage >= 1 && seg.endPage >= seg.startPage)
    .sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage);

  const segments: DocumentSegment[] = [];
  for (const candidate of candidates) {
    const prev = segments[segments.length - 1];
    if (!prev) {
      // Coverage must begin at page 1.
      segments.push({ ...candidate, startPage: 1 });
      continue;
    }
    if (candidate.endPage <= prev.endPage) continue; // fully contained — drop
    // Trim overlap and close any gap against the previous segment.
    segments.push({ ...candidate, startPage: prev.endPage + 1 });
  }

  if (!segments.length) {
    return [{
      title: 'Untitled document',
      documentType: fallbackType,
      startPage: 1,
      endPage: pageCount,
      confidence: 0.3,
    }];
  }

  segments[segments.length - 1].endPage = pageCount;
  return segments;
}

// Window size for segmentation model calls on very large files. Boundaries
// exactly at a window edge may split a document in two — acceptable for now;
// each half still carries correct page provenance.
export const SEGMENTATION_WINDOW_PAGES = 150;

// Per-page snippet length given to the segmentation model.
export const SEGMENT_SNIPPET_CHARS = 240;

export function buildSegmentationSnippets(
  pages: Array<{ pageNumber: number; text: string | null }>,
): string {
  return pages
    .map(page => {
      const snippet = (page.text || '').replace(/\s+/g, ' ').trim().slice(0, SEGMENT_SNIPPET_CHARS);
      return `[PAGE ${page.pageNumber}] ${snippet || '(no text)'}`;
    })
    .join('\n');
}
