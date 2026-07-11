import { describe, expect, it } from 'vitest';
import { buildSegmentationSnippets, normalizeSegments } from '@/lib/intake/segments';

describe('normalizeSegments', () => {
  it('keeps a clean partition unchanged', () => {
    const result = normalizeSegments([
      { title: 'Incident report', documentType: 'police_report', startPage: 1, endPage: 4, confidence: 0.9 },
      { title: 'Interview — Lopez', documentType: 'interview', startPage: 5, endPage: 10, confidence: 0.8 },
    ], 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startPage: 1, endPage: 4, documentType: 'police_report' });
    expect(result[1]).toMatchObject({ startPage: 5, endPage: 10, documentType: 'interview' });
  });

  it('closes gaps and trims overlaps so every page is covered exactly once', () => {
    const result = normalizeSegments([
      { title: 'A', documentType: 'police_report', startPage: 2, endPage: 5 },   // gap before page 2
      { title: 'B', documentType: 'tip', startPage: 4, endPage: 7 },             // overlaps A
      { title: 'C', documentType: 'lab_report', startPage: 9, endPage: 9 },      // gap at page 8
    ], 12); // last segment must extend to page 12

    expect(result.map(s => [s.startPage, s.endPage])).toEqual([[1, 5], [6, 7], [8, 12]]);
  });

  it('drops segments fully contained in a previous one', () => {
    const result = normalizeSegments([
      { title: 'A', documentType: 'police_report', startPage: 1, endPage: 10 },
      { title: 'B', documentType: 'tip', startPage: 3, endPage: 6 },
    ], 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startPage: 1, endPage: 10 });
  });

  it('falls back to one whole-file segment when the model returns nothing usable', () => {
    const result = normalizeSegments([{ startPage: 0, endPage: -2 }], 7, 'witness_statement');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startPage: 1, endPage: 7, documentType: 'witness_statement' });
  });

  it('replaces unknown document types with the fallback and clamps out-of-range pages', () => {
    const result = normalizeSegments([
      { title: 'X', documentType: 'ransom_note', startPage: -3, endPage: 99, confidence: 7 },
    ], 5, 'other');

    expect(result[0]).toMatchObject({ startPage: 1, endPage: 5, documentType: 'other', confidence: 1 });
  });

  it('returns nothing for an empty file', () => {
    expect(normalizeSegments([], 0)).toEqual([]);
  });
});

describe('buildSegmentationSnippets', () => {
  it('produces one line per page with absolute page numbers', () => {
    const snippets = buildSegmentationSnippets([
      { pageNumber: 151, text: 'SUPPLEMENTAL   REPORT\ncase 87-1123' },
      { pageNumber: 152, text: null },
    ]);

    expect(snippets).toBe('[PAGE 151] SUPPLEMENTAL REPORT case 87-1123\n[PAGE 152] (no text)');
  });
});
