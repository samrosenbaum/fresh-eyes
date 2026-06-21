import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Legacy exports kept for compatibility while the codebase migrates to lib/ai/*.
// New AI work should use the task-based provider in lib/ai/provider.ts so the
// app can swap to Vercel AI SDK-backed model routing without touching jobs/UI.
export const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'claude-opus-4-8';
export const FAST_MODEL = process.env.AI_FAST_MODEL || 'claude-sonnet-4-6';
