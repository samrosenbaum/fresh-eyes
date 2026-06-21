import { generateText } from '@/lib/ai/provider';
import { buildReportPrompt } from '@/lib/prompts/report';

export interface CaseBriefInput {
  caseName: string;
  description?: string;
  entities: unknown[];
  statements: unknown[];
  timeline: unknown[];
  contradictions: unknown[];
  fileCount: number;
}

export async function generateCaseBrief(input: CaseBriefInput): Promise<string> {
  return generateText({
    profile: 'briefing',
    maxTokens: 16384,
    prompt: buildReportPrompt(input),
  });
}
