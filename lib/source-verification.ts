import crypto from 'crypto';

// Verifies that AI-extracted "verbatim" quotes actually appear in the stored
// page text they cite. This is what turns "the model said so" into "it's on
// page 7" — the core trust requirement for investigator adoption.

export type SourceVerificationStatus = 'verified' | 'relocated' | 'unverified';

export interface VerificationPage {
  pageNumber: number;
  normalizedText: string;
}

export interface VerifiedCitation {
  status: SourceVerificationStatus;
  // The page the quote was actually found on ('verified'/'relocated'), or the
  // model's original claim when it couldn't be confirmed ('unverified').
  pageNumber: number | null;
}

// Quotes shorter than this match too promiscuously to prove provenance.
const MIN_QUOTE_LENGTH = 12;

// Normalize OCR artifacts that shouldn't break an exact-substring match:
// curly quotes, long dashes, case, and whitespace runs.
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareVerificationPages(
  pages: Array<{ pageNumber: number; text: string | null }>,
): VerificationPage[] {
  return pages.map(page => ({
    pageNumber: page.pageNumber,
    normalizedText: normalizeForMatch(page.text || ''),
  }));
}

export function verifyQuote(
  quote: string | null | undefined,
  citedPage: number | null | undefined,
  pages: VerificationPage[],
): VerifiedCitation {
  const claimedPage = typeof citedPage === 'number' ? citedPage : null;
  if (!quote) return { status: 'unverified', pageNumber: claimedPage };

  const needle = normalizeForMatch(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return { status: 'unverified', pageNumber: claimedPage };

  const cited = pages.find(page => page.pageNumber === claimedPage);
  if (cited?.normalizedText.includes(needle)) {
    return { status: 'verified', pageNumber: cited.pageNumber };
  }

  for (const page of pages) {
    if (page.pageNumber === claimedPage) continue;
    if (page.normalizedText.includes(needle)) {
      return { status: 'relocated', pageNumber: page.pageNumber };
    }
  }

  return { status: 'unverified', pageNumber: claimedPage };
}

// Content fingerprint for duplicate-page detection, sharing the same
// normalization so trivially different scans of the same page still match.
export function fingerprintText(text: string): string {
  return crypto.createHash('sha256').update(normalizeForMatch(text)).digest('hex');
}
