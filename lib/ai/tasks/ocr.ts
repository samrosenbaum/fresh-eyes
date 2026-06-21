import { generateText } from '@/lib/ai/provider';
import { OCR_PROMPT } from '@/lib/prompts/ocr';

export async function transcribeImage(input: {
  imageBuffer: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}): Promise<string> {
  return generateText({
    profile: 'ocr',
    maxTokens: 4096,
    content: [
      { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBuffer.toString('base64') } },
      { type: 'text', text: OCR_PROMPT },
    ],
  });
}

export async function transcribePdfDocument(input: { pdfBuffer: Buffer }): Promise<string> {
  return generateText({
    profile: 'ocr',
    maxTokens: 8192,
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBuffer.toString('base64') } },
      { type: 'text', text: OCR_PROMPT },
    ],
  });
}
