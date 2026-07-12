export interface AdjudicationProfile {
  name: string;
  aliases: string[];
  role: string;
  type: string;
  attributes: Record<string, unknown>;
  quotes: string[]; // source quotes from documents where this entity is mentioned
}

function renderProfile(label: string, profile: AdjudicationProfile): string {
  const attrs = Object.entries(profile.attributes || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n');

  const quotes = profile.quotes.length
    ? profile.quotes.map(q => `  - "${q}"`).join('\n')
    : '  (no source quotes on file)';

  return `${label}: ${profile.name}
Aliases: ${profile.aliases.length ? profile.aliases.join(', ') : '(none)'}
Role: ${profile.role}
Attributes:
${attrs || '  (none)'}
Source quotes mentioning this entity:
${quotes}`;
}

export function buildEntityAdjudicationPrompt(a: AdjudicationProfile, b: AdjudicationProfile): string {
  return `You are helping a cold case investigator decide whether two extracted ${a.type} records refer to the SAME real-world ${a.type}.

${renderProfile('RECORD A', a)}

${renderProfile('RECORD B', b)}

Consider: name variants, nicknames, initials, and misspellings; consistent or contradictory attributes (ages that don't fit, different addresses at the same time, conflicting descriptions); and what the source quotes imply. People can share a name — a name match alone is not proof.

Return a single JSON object:

{
  "verdict": "same" | "different" | "unsure",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences citing the specific evidence (names, attributes, quotes) that drove the verdict"
}

Rules:
- "same" only when the evidence genuinely supports one ${a.type}
- "different" when attributes or context contradict a match
- "unsure" when evidence is thin — an investigator will review it
- Never invent facts not present above
- Return ONLY the JSON object`;
}
