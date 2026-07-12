// Pure helpers for the evidence inventory. Evidence items are case-shared
// (like entities): extraction from any document resolves against existing
// items by normalized label, and testing status only ever advances.

export const EVIDENCE_CATEGORIES = [
  'weapon',
  'biological',
  'fingerprint',
  'document',
  'clothing',
  'digital',
  'vehicle',
  'other',
] as const;

// Ordered by investigative progress; a merge never moves an item backwards.
export const EVIDENCE_STATUS_RANK: Record<string, number> = {
  unknown: 0,
  missing: 1,
  collected: 2,
  submitted: 3,
  tested: 4,
};

export function normalizeEvidenceLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[#.,'"():;—–]/g, ' ')
    .replace(/\bitem\b|\bevidence\b|\bexhibit\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mostAdvancedStatus(a: string | null | undefined, b: string | null | undefined): string {
  const rankA = EVIDENCE_STATUS_RANK[a || ''] ?? -1;
  const rankB = EVIDENCE_STATUS_RANK[b || ''] ?? -1;
  if (rankA < 0 && rankB < 0) return 'unknown';
  return rankA >= rankB ? (a as string) : (b as string);
}

export function normalizeEvidenceStatus(status: unknown): string {
  return typeof status === 'string' && status in EVIDENCE_STATUS_RANK ? status : 'unknown';
}

export function normalizeEvidenceCategory(category: unknown): string {
  return typeof category === 'string' && (EVIDENCE_CATEGORIES as readonly string[]).includes(category)
    ? category
    : 'other';
}
