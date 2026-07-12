// Deterministic candidate generation for entity resolution. Finds pairs of
// entities that might be the same person/place/vehicle using name and
// identifier signals. Candidates above threshold go to LLM adjudication with
// source quotes; nothing merges without a recorded proposal.

export interface ResolutionEntity {
  id: string;
  type: string;
  canonicalName: string;
  aliases: string[];
  attributes: Record<string, unknown>;
}

export interface MatchCandidate {
  entityAId: string;
  entityBId: string;
  score: number;
  signals: string[];
}

// Candidates below this score are not worth an adjudication call.
export const CANDIDATE_SCORE_THRESHOLD = 0.6;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOnly(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function normalizedAttr(entity: ResolutionEntity, key: string): string {
  const value = entity.attributes?.[key];
  return typeof value === 'string' ? normalizeName(value) : '';
}

function allNames(entity: ResolutionEntity): string[] {
  return [entity.canonicalName, ...(entity.aliases || [])].map(normalizeName).filter(Boolean);
}

// Best name-pair signal between two entities.
function nameSignal(a: ResolutionEntity, b: ResolutionEntity): { score: number; signal: string } | null {
  let best: { score: number; signal: string } | null = null;
  const consider = (score: number, signal: string) => {
    if (!best || score > best.score) best = { score, signal };
  };

  for (const nameA of allNames(a)) {
    for (const nameB of allNames(b)) {
      if (nameA === nameB) {
        consider(1.0, 'exact_name');
        continue;
      }

      const tokensA = nameA.split(' ');
      const tokensB = nameB.split(' ');

      // "john smith" ⊆ "john michael smith"
      const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
      if (shorter.length >= 2 && shorter.every(token => longer.includes(token))) {
        consider(0.85, 'name_contains');
        continue;
      }

      // "j smith" vs "john smith": same last name, matching first initial
      if (tokensA.length >= 2 && tokensB.length >= 2) {
        const lastA = tokensA[tokensA.length - 1];
        const lastB = tokensB[tokensB.length - 1];
        if (lastA === lastB && lastA.length > 2 && tokensA[0][0] === tokensB[0][0]) {
          consider(0.7, 'initial_match');
          continue;
        }
      }

      // General token overlap (order-insensitive)
      const setA = new Set(tokensA.filter(token => token.length > 2));
      const setB = new Set(tokensB.filter(token => token.length > 2));
      if (setA.size && setB.size) {
        let shared = 0;
        setA.forEach(token => { if (setB.has(token)) shared++; });
        const jaccard = shared / (setA.size + setB.size - shared);
        if (jaccard >= 0.5) consider(0.6, 'token_overlap');
      }
    }
  }

  return best;
}

// Hard identifiers shared by both entities (phone, plate, address).
function identifierSignals(a: ResolutionEntity, b: ResolutionEntity): string[] {
  const signals: string[] = [];

  const phoneA = digitsOnly(a.attributes?.phone);
  if (phoneA.length >= 7 && phoneA === digitsOnly(b.attributes?.phone)) signals.push('shared_phone');

  const plateA = normalizedAttr(a, 'plate_number').replace(/\s/g, '');
  if (plateA && plateA === normalizedAttr(b, 'plate_number').replace(/\s/g, '')) signals.push('shared_plate');

  const addressA = normalizedAttr(a, 'address');
  if (addressA && addressA === normalizedAttr(b, 'address')) signals.push('shared_address');

  return signals;
}

export function scorePair(a: ResolutionEntity, b: ResolutionEntity): MatchCandidate | null {
  if (a.type !== b.type) return null;

  const name = nameSignal(a, b);
  const identifiers = identifierSignals(a, b);

  let score = name?.score || 0;
  if (identifiers.length) score = Math.max(score, 0.95);
  if (score < CANDIDATE_SCORE_THRESHOLD) return null;

  return {
    entityAId: a.id,
    entityBId: b.id,
    score,
    signals: [...(name ? [name.signal] : []), ...identifiers],
  };
}

export function generateMatchCandidates(entities: ResolutionEntity[]): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const candidate = scorePair(entities[i], entities[j]);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

// ── Merge field logic (pure; used by the merge executor) ────────────────────

const ROLE_RANK: Record<string, number> = { victim: 5, suspect: 4, witness: 3, investigator: 2, mentioned: 1 };

export function mergeEntityFields(
  primary: { canonicalName: string; aliases: string[]; role: string; attributes: Record<string, unknown> },
  duplicate: { canonicalName: string; aliases: string[]; role: string; attributes: Record<string, unknown> },
) {
  const aliases = Array.from(new Set(
    [...(primary.aliases || []), duplicate.canonicalName, ...(duplicate.aliases || [])]
      .filter(name => name && normalizeName(name) !== normalizeName(primary.canonicalName)),
  ));

  return {
    aliases,
    // Primary's values win on conflicts; duplicate fills gaps.
    attributes: { ...(duplicate.attributes || {}), ...(primary.attributes || {}) },
    role: (ROLE_RANK[duplicate.role] || 0) > (ROLE_RANK[primary.role] || 0) ? duplicate.role : primary.role,
  };
}
