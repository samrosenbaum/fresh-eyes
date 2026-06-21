import { generateJson } from '@/lib/ai/provider';
import { buildContradictionPrompt } from '@/lib/prompts/contradiction-detection';

export interface CaseGapFinding {
  type: string;
  severity: string;
  title: string;
  description: string;
  evidence?: {
    quotes?: string[];
    entity_names?: string[];
    file_ids?: string[];
    entity_ids?: string[];
  };
}

export interface CaseGapInput {
  caseName: string;
  entities: unknown[];
  relationships: unknown[];
  statements: unknown[];
  timeline: unknown[];
}

export async function detectCaseGaps(input: CaseGapInput): Promise<CaseGapFinding[]> {
  return generateJson<CaseGapFinding[]>({
    profile: 'analysis',
    maxTokens: 8192,
    fallback: [],
    prompt: buildContradictionPrompt(input),
    onParseError: payload => {
      console.error('[detect-case-gaps] Failed to parse gap JSON:', payload.slice(0, 500));
    },
  });
}
