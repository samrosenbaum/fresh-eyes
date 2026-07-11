import { describe, expect, it } from 'vitest';
import { extractJsonPayload, parseJsonOrFallback } from '@/lib/ai/json';

describe('extractJsonPayload', () => {
  it('extracts fenced JSON blocks', () => {
    expect(extractJsonPayload('Here you go:\n```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('extracts bare objects surrounded by commentary', () => {
    expect(extractJsonPayload('Sure! {"a": 1} Hope that helps.')).toBe('{"a": 1}');
  });

  it('extracts arrays', () => {
    expect(extractJsonPayload('[1, 2, 3]')).toBe('[1, 2, 3]');
  });

  it('returns input unchanged when no JSON delimiters exist', () => {
    expect(extractJsonPayload('no json here')).toBe('no json here');
  });
});

describe('parseJsonOrFallback', () => {
  it('parses valid payloads', () => {
    expect(parseJsonOrFallback('```json\n{"entities": []}\n```', null)).toEqual({ entities: [] });
  });

  it('returns the fallback and reports the payload on parse failure', () => {
    let reported: string | null = null;
    const result = parseJsonOrFallback('{"broken": ', { ok: false }, payload => { reported = payload; });
    expect(result).toEqual({ ok: false });
    expect(reported).not.toBeNull();
  });
});
