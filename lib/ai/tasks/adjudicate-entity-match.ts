import { generateJson } from '@/lib/ai/provider';
import { buildEntityAdjudicationPrompt, AdjudicationProfile } from '@/lib/prompts/entity-adjudication';

export type AdjudicationVerdict = 'same' | 'different' | 'unsure';

export interface EntityMatchAdjudication {
  verdict: AdjudicationVerdict;
  confidence: number;
  reasoning: string;
}

const FALLBACK: EntityMatchAdjudication = {
  verdict: 'unsure',
  confidence: 0,
  reasoning: 'Adjudication failed to produce a valid result; needs human review.',
};

export async function adjudicateEntityMatch(input: {
  a: AdjudicationProfile;
  b: AdjudicationProfile;
}): Promise<EntityMatchAdjudication> {
  const result = await generateJson<Partial<EntityMatchAdjudication>>({
    profile: 'analysis',
    maxTokens: 1024,
    fallback: FALLBACK,
    prompt: buildEntityAdjudicationPrompt(input.a, input.b),
    onParseError: payload => {
      console.error('[adjudicate-entity-match] Failed to parse adjudication JSON:', payload.slice(0, 300));
    },
  });

  const verdict: AdjudicationVerdict = result.verdict === 'same' || result.verdict === 'different'
    ? result.verdict
    : 'unsure';

  return {
    verdict,
    confidence: typeof result.confidence === 'number' ? Math.min(1, Math.max(0, result.confidence)) : 0.5,
    reasoning: typeof result.reasoning === 'string' && result.reasoning.trim()
      ? result.reasoning.trim()
      : 'No reasoning provided.',
  };
}
