import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';
import { generateMatchCandidates, MatchCandidate, ResolutionEntity } from '@/lib/entity-resolution';
import { adjudicateEntityMatch } from '@/lib/ai/tasks/adjudicate-entity-match';
import { AdjudicationProfile } from '@/lib/prompts/entity-adjudication';

// Max candidate pairs adjudicated per run (cost control); rerun the pass to
// continue — already-adjudicated pairs are skipped via the proposals table.
const MAX_CANDIDATES_PER_RUN = 30;
const CANDIDATES_PER_STEP = 4;
const QUOTES_PER_ENTITY = 5;

async function buildProfile(entityId: string): Promise<AdjudicationProfile | null> {
  const [entityRes, mentionsRes] = await Promise.all([
    supabaseAdmin.from('entities').select('*').eq('id', entityId).maybeSingle(),
    supabaseAdmin
      .from('entity_mentions')
      .select('source_quote')
      .eq('entity_id', entityId)
      .not('source_quote', 'is', null)
      .eq('source_verification', 'verified')
      .limit(QUOTES_PER_ENTITY),
  ]);

  const entity = entityRes.data;
  if (!entity) return null;

  return {
    name: entity.canonical_name,
    aliases: entity.aliases || [],
    role: entity.role,
    type: entity.type,
    attributes: entity.attributes || {},
    quotes: (mentionsRes.data || []).map(m => m.source_quote).filter(Boolean),
  };
}

export const resolveEntitiesJob = inngest.createFunction(
  {
    id: 'resolve-entities',
    name: 'Resolve Duplicate Entities',
    retries: 1,
    concurrency: { limit: 2 },
    triggers: { event: 'analysis/resolve-entities' },
  },
  async ({ event, step }) => {
    const { caseId } = event.data;

    // Deterministic candidate generation, skipping pairs already adjudicated.
    const candidates = await step.run('generate-candidates', async (): Promise<MatchCandidate[]> => {
      const [entitiesRes, proposalsRes] = await Promise.all([
        supabaseAdmin
          .from('entities')
          .select('id, type, canonical_name, aliases, attributes')
          .eq('case_id', caseId),
        supabaseAdmin
          .from('entity_merge_proposals')
          .select('primary_entity_id, duplicate_entity_id')
          .eq('case_id', caseId),
      ]);

      const seen = new Set(
        (proposalsRes.data || []).flatMap(p => [
          `${p.primary_entity_id}:${p.duplicate_entity_id}`,
          `${p.duplicate_entity_id}:${p.primary_entity_id}`,
        ]),
      );

      const entities: ResolutionEntity[] = (entitiesRes.data || []).map(e => ({
        id: e.id,
        type: e.type,
        canonicalName: e.canonical_name,
        aliases: e.aliases || [],
        attributes: e.attributes || {},
      }));

      return generateMatchCandidates(entities)
        .filter(c => !seen.has(`${c.entityAId}:${c.entityBId}`))
        .slice(0, MAX_CANDIDATES_PER_RUN);
    });

    // Adjudicate candidates with source quotes, in small parallel steps.
    let proposed = 0;
    let aiRejected = 0;

    const chunks: MatchCandidate[][] = [];
    for (let i = 0; i < candidates.length; i += CANDIDATES_PER_STEP) {
      chunks.push(candidates.slice(i, i + CANDIDATES_PER_STEP));
    }

    const chunkResults = await Promise.all(
      chunks.map((chunk, index) =>
        step.run(`adjudicate-${index + 1}`, async () => {
          const results = { proposed: 0, aiRejected: 0 };

          for (const candidate of chunk) {
            const [profileA, profileB] = await Promise.all([
              buildProfile(candidate.entityAId),
              buildProfile(candidate.entityBId),
            ]);
            if (!profileA || !profileB) continue; // entity merged/removed mid-run

            const adjudication = await adjudicateEntityMatch({ a: profileA, b: profileB });

            const { error } = await supabaseAdmin.from('entity_merge_proposals').upsert({
              case_id: caseId,
              primary_entity_id: candidate.entityAId,
              duplicate_entity_id: candidate.entityBId,
              score: candidate.score,
              signals: candidate.signals,
              ai_verdict: adjudication.verdict,
              ai_confidence: adjudication.confidence,
              ai_reasoning: adjudication.reasoning,
              status: adjudication.verdict === 'different' ? 'ai_rejected' : 'proposed',
            }, { onConflict: 'primary_entity_id,duplicate_entity_id' });

            if (error) throw new Error(`Failed to store merge proposal: ${error.message}`);
            if (adjudication.verdict === 'different') results.aiRejected++;
            else results.proposed++;
          }

          return results;
        }),
      ),
    );

    for (const result of chunkResults) {
      proposed += result.proposed;
      aiRejected += result.aiRejected;
    }

    return { caseId, candidates: candidates.length, proposed, aiRejected };
  }
);
