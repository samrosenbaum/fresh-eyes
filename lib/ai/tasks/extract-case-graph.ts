import { generateJson } from '@/lib/ai/provider';
import { buildEntityExtractionPrompt } from '@/lib/prompts/entity-extraction';

export interface ExtractedPageCitation {
  page: number;
  quote: string;
}

export interface ExtractedEntity {
  type: string;
  name: string;
  aliases: string[];
  role: string;
  attributes: Record<string, unknown>;
  mentions: ExtractedPageCitation[];
}

export interface ExtractedRelationship {
  from: string;
  to: string;
  type: string;
  description: string;
  page: number | null;
  quote: string | null;
}

export interface ExtractedStatement {
  speaker: string | null;
  date: string | null;
  time: string | null;
  content: string;
  about: string[];
  page: number | null;
  quote: string | null;
}

export interface ExtractedTimelineEvent {
  date: string | null;
  time: string | null;
  precision: string;
  description: string;
  people: string[];
  page: number | null;
  quote: string | null;
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

export interface SourcePageText {
  pageNumber: number;
  text: string;
}

// Cap extraction input so a giant case packet doesn't blow the context
// window; pages beyond the cap are skipped (logged by the caller via the
// returned graph being partial — full-document chunked extraction is a
// later milestone).
const MAX_EXTRACTION_CHARS = 200_000;

export function buildPageTaggedText(pages: SourcePageText[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const page of pages) {
    const block = `[PAGE ${page.pageNumber}]\n${page.text.trim()}`;
    if (total + block.length > MAX_EXTRACTION_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n\n');
}

export async function extractCaseGraphFromDocument(input: {
  pages: SourcePageText[];
  documentType: string;
  filename: string;
}): Promise<ExtractedCaseGraph> {
  const extractionPrompt = buildEntityExtractionPrompt(input.documentType, input.filename);
  const taggedText = buildPageTaggedText(input.pages);

  const graph = await generateJson<ExtractedCaseGraph>({
    profile: 'extraction',
    maxTokens: 8192,
    fallback: EMPTY_CASE_GRAPH,
    prompt: `${extractionPrompt}\n\nDocument text to analyze:\n\n${taggedText}\n\nReturn only the extracted JSON object.`,
    onParseError: payload => {
      console.error('[extract-case-graph] Failed to parse extraction JSON:', payload.slice(0, 500));
    },
  });

  // Defensive normalization — downstream storage assumes arrays exist.
  return {
    entities: (graph.entities || []).map(e => ({ ...e, aliases: e.aliases || [], mentions: e.mentions || [] })),
    relationships: graph.relationships || [],
    statements: graph.statements || [],
    timeline_events: graph.timeline_events || [],
  };
}
