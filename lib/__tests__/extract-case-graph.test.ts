import { describe, expect, it } from 'vitest';
import { buildPageTaggedText } from '@/lib/ai/tasks/extract-case-graph';

describe('buildPageTaggedText', () => {
  it('tags each page with its real page number', () => {
    const text = buildPageTaggedText([
      { pageNumber: 1, text: 'first page' },
      { pageNumber: 3, text: 'third page' },
    ]);
    expect(text).toBe('[PAGE 1]\nfirst page\n\n[PAGE 3]\nthird page');
  });

  it('stops adding pages once the input cap is reached', () => {
    const bigPage = 'x'.repeat(150_000);
    const text = buildPageTaggedText([
      { pageNumber: 1, text: bigPage },
      { pageNumber: 2, text: bigPage },
      { pageNumber: 3, text: 'small page' },
    ]);
    expect(text).toContain('[PAGE 1]');
    expect(text).not.toContain('[PAGE 2]');
  });
});
