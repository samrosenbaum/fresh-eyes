import { generateText } from '@/lib/ai/provider';
import { parseJsonOrFallback } from '@/lib/ai/json';
import { OCR_PAGE_PROMPT } from '@/lib/prompts/ocr';

export interface PageOcrResult {
  text: string;
  confidence: number;
}

function parseOcrResponse(raw: string): PageOcrResult {
  const parsed = parseJsonOrFallback<{ text?: unknown; confidence?: unknown } | null>(raw, null);
  if (parsed && typeof parsed.text === 'string') {
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;
    return { text: parsed.text, confidence };
  }
  // The model didn't return valid JSON — keep the raw output as the
  // transcription rather than losing it, flagged as low confidence.
  return { text: raw.trim(), confidence: 0.5 };
}

export async function transcribeImagePage(input: {
  imageBuffer: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}): Promise<PageOcrResult> {
  const raw = await generateText({
    profile: 'ocr',
    maxTokens: 8192,
    content: [
      { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBuffer.toString('base64') } },
      { type: 'text', text: OCR_PAGE_PROMPT },
    ],
  });
  return parseOcrResponse(raw);
}

// Expects a single-page PDF (the processing job splits multi-page PDFs
// before calling this) so each transcription maps to exactly one source page.
export async function transcribePdfPage(input: { pdfBuffer: Buffer }): Promise<PageOcrResult> {
  const raw = await generateText({
    profile: 'ocr',
    maxTokens: 8192,
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBuffer.toString('base64') } },
      { type: 'text', text: OCR_PAGE_PROMPT },
    ],
  });
  return parseOcrResponse(raw);
}
