export type AiTaskProfile = 'ocr' | 'extraction' | 'analysis' | 'briefing' | 'fast';

export const AI_MODELS: Record<AiTaskProfile, string> = {
  ocr: process.env.AI_OCR_MODEL || process.env.AI_ANALYSIS_MODEL || 'claude-opus-4-8',
  extraction: process.env.AI_EXTRACTION_MODEL || process.env.AI_ANALYSIS_MODEL || 'claude-opus-4-8',
  analysis: process.env.AI_ANALYSIS_MODEL || 'claude-opus-4-8',
  briefing: process.env.AI_BRIEFING_MODEL || process.env.AI_ANALYSIS_MODEL || 'claude-opus-4-8',
  fast: process.env.AI_FAST_MODEL || 'claude-sonnet-4-6',
};
