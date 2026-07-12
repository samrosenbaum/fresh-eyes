import { describe, expect, it } from 'vitest';
import {
  mostAdvancedStatus,
  normalizeEvidenceCategory,
  normalizeEvidenceLabel,
  normalizeEvidenceStatus,
} from '@/lib/evidence';

describe('normalizeEvidenceLabel', () => {
  it('matches label variants that refer to the same item', () => {
    expect(normalizeEvidenceLabel('Item #12 — Blue Sweater')).toBe(normalizeEvidenceLabel('item 12 — blue sweater'));
    expect(normalizeEvidenceLabel('Evidence: kitchen knife')).toBe(normalizeEvidenceLabel('Kitchen Knife'));
    expect(normalizeEvidenceLabel('Exhibit "A" (shell casing)')).toBe(normalizeEvidenceLabel('a shell casing'));
  });

  it('keeps genuinely different items apart', () => {
    expect(normalizeEvidenceLabel('blue sweater')).not.toBe(normalizeEvidenceLabel('red sweater'));
  });
});

describe('mostAdvancedStatus', () => {
  it('never moves an item backwards', () => {
    expect(mostAdvancedStatus('tested', 'collected')).toBe('tested');
    expect(mostAdvancedStatus('collected', 'submitted')).toBe('submitted');
    expect(mostAdvancedStatus('unknown', 'missing')).toBe('missing');
  });

  it('handles nulls and unknown values', () => {
    expect(mostAdvancedStatus(null, 'collected')).toBe('collected');
    expect(mostAdvancedStatus('bogus', undefined)).toBe('unknown');
  });
});

describe('normalizers', () => {
  it('coerces unknown statuses and categories to safe defaults', () => {
    expect(normalizeEvidenceStatus('vaporized')).toBe('unknown');
    expect(normalizeEvidenceStatus('tested')).toBe('tested');
    expect(normalizeEvidenceCategory('cursed artifact')).toBe('other');
    expect(normalizeEvidenceCategory('biological')).toBe('biological');
  });
});
