import { describe, expect, it } from 'vitest';
import {
  fingerprintText,
  normalizeForMatch,
  prepareVerificationPages,
  verifyQuote,
} from '@/lib/source-verification';

const pages = prepareVerificationPages([
  { pageNumber: 1, text: 'Officer Daniels responded to 42 Elm Street at 11:40 PM on June 3, 1987.' },
  { pageNumber: 2, text: 'Witness Maria Lopez stated: “I saw a blue sedan parked across the street.”' },
  { pageNumber: 3, text: null },
]);

describe('verifyQuote', () => {
  it('verifies a quote found on its cited page', () => {
    const result = verifyQuote('responded to 42 Elm Street at 11:40 PM', 1, pages);
    expect(result).toEqual({ status: 'verified', pageNumber: 1 });
  });

  it('normalizes whitespace and curly quotes before matching', () => {
    const result = verifyQuote('"I saw a   blue sedan parked across the street."', 2, pages);
    expect(result).toEqual({ status: 'verified', pageNumber: 2 });
  });

  it('relocates a quote cited on the wrong page to where it actually appears', () => {
    const result = verifyQuote('I saw a blue sedan parked', 1, pages);
    expect(result).toEqual({ status: 'relocated', pageNumber: 2 });
  });

  it('marks quotes not found anywhere as unverified, keeping the claimed page', () => {
    const result = verifyQuote('the suspect confessed immediately', 2, pages);
    expect(result).toEqual({ status: 'unverified', pageNumber: 2 });
  });

  it('marks missing or too-short quotes as unverified', () => {
    expect(verifyQuote(null, 1, pages).status).toBe('unverified');
    expect(verifyQuote('', 1, pages).status).toBe('unverified');
    expect(verifyQuote('at 11:40', 1, pages).status).toBe('unverified');
  });

  it('handles a missing cited page number by still searching all pages', () => {
    const result = verifyQuote('Officer Daniels responded', null, pages);
    expect(result).toEqual({ status: 'relocated', pageNumber: 1 });
  });
});

describe('normalizeForMatch', () => {
  it('collapses whitespace, lowercases, and maps curly punctuation', () => {
    expect(normalizeForMatch('  “Hello—there’s   MORE”  ')).toBe('"hello-there\'s more"');
  });
});

describe('fingerprintText', () => {
  it('matches pages that differ only in whitespace and casing', () => {
    expect(fingerprintText('Case  Report\nPage One')).toBe(fingerprintText('case report page ONE'));
  });

  it('differs for different content', () => {
    expect(fingerprintText('page one')).not.toBe(fingerprintText('page two'));
  });
});
