import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';
import { CaseGapFinding, detectCaseGaps } from '@/lib/ai/tasks/detect-case-gaps';

export const detectContradictionsJob = inngest.createFunction(
  {
    id: 'detect-contradictions',
    name: 'Detect Case Contradictions',
    retries: 1,
    concurrency: { limit: 2 },
    triggers: { event: 'analysis/detect-contradictions' },
  },
  async ({ event, step }) => {
    const { caseId } = event.data;

    // Build full case graph
    const caseData = await step.run('build-case-graph', async () => {
      const [caseResult, entitiesResult, relationshipsResult, statementsResult, timelineResult] = await Promise.all([
        supabaseAdmin.from('cases').select('name, description').eq('id', caseId).single(),
        supabaseAdmin.from('entities').select('*').eq('case_id', caseId).order('role'),
        supabaseAdmin.from('relationships')
          .select(`*, from_entity:from_entity_id(canonical_name), to_entity:to_entity_id(canonical_name)`)
          .eq('case_id', caseId),
        supabaseAdmin.from('statements')
          .select(`*, speaker:speaker_entity_id(canonical_name), source_file:source_file_id(filename, document_type)`)
          .eq('case_id', caseId)
          .order('statement_date'),
        supabaseAdmin.from('timeline_events')
          .select('*')
          .eq('case_id', caseId)
          .order('event_date')
          .order('event_time'),
      ]);

      return {
        caseName: caseResult.data?.name || 'Unknown Case',
        description: caseResult.data?.description,
        entities: entitiesResult.data || [],
        relationships: (relationshipsResult.data || []).map(r => ({
          from: (r.from_entity as any)?.canonical_name,
          to: (r.to_entity as any)?.canonical_name,
          type: r.relationship_type,
          description: r.description,
        })),
        statements: (statementsResult.data || []).map(s => ({
          speaker: (s.speaker as any)?.canonical_name || 'Unknown',
          date: s.statement_date,
          time: s.statement_time,
          content: s.content,
          source: (s.source_file as any)?.filename,
          document_type: (s.source_file as any)?.document_type,
        })),
        timeline: timelineResult.data || [],
      };
    });

    // Run case-gap detection through the AI task layer.
    const contradictions = await step.run('detect', async (): Promise<CaseGapFinding[]> => {
      return detectCaseGaps(caseData);
    });

    // Store contradictions
    await step.run('store-contradictions', async () => {
      if (!contradictions.length) return;

      // Clear previous auto-detected contradictions for this case
      await supabaseAdmin.from('contradictions').delete().eq('case_id', caseId).eq('status', 'open');

      const rows = contradictions.map((c: any) => ({
        case_id: caseId,
        type: c.type,
        severity: c.severity,
        title: c.title,
        description: c.description,
        evidence: c.evidence || {},
        status: 'open',
      }));

      await supabaseAdmin.from('contradictions').insert(rows);
    });

    return { caseId, contradictionsFound: contradictions.length };
  }
);
