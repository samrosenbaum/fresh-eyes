import { generateJson } from '@/lib/ai/provider';
import { buildEntityExtractionPrompt } from '@/lib/prompts/entity-extraction';

export interface ExtractedEntity {
  type: string;
  name: string;
  aliases: string[];
  role: string;
  attributes: Record<string, unknown>;
}

export interface ExtractedRelationship {
  from: string;
  to: string;
  type: string;
  description: string;
}

export interface ExtractedStatement {
  speaker: string | null;
  date: string | null;
  time: string | null;
  content: string;
  about: string[];
}

export interface ExtractedTimelineEvent {
  date: string | null;
  time: string | null;
  precision: string;
  description: string;
  people: string[];
}

export interface ExtractedCaseGraph {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  statements: ExtractedStatement[];
  timeline_events: ExtractedTimelineEvent[];
}

export const EMPTY_CASE_GRAPH: ExtractedCaseGraph = {
  entities: [],
  relationships: [],
  statements: [],
  timeline_events: [],
};

export async function extractCaseGraphFromDocument(input: {
  text: string;
  documentType: string;
  filename: string;
}): Promise<ExtractedCaseGraph> {
  const extractionPrompt = buildEntityExtractionPrompt(input.documentType, input.filename);

  return generateJson<ExtractedCaseGraph>({
    profile: 'extraction',
    maxTokens: 8192,
    fallback: EMPTY_CASE_GRAPH,
    prompt: `${extractionPrompt}\n\nDocument text to analyze:\n\n${input.text}\n\nReturn only the extracted JSON object.`,
    onParseError: payload => {
      console.error('[extract-case-graph] Failed to parse extraction JSON:', payload.slice(0, 500));
    },
  });
}
