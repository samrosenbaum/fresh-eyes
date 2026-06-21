import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';
import { AI_MODELS } from '@/lib/ai/models';
import { generateCaseBrief } from '@/lib/ai/tasks/generate-case-brief';

export const generateReportJob = inngest.createFunction(
  {
    id: 'generate-report',
    name: 'Generate Investigation Report',
    retries: 1,
    concurrency: { limit: 2 },
    triggers: { event: 'analysis/generate-report' },
  },
  async ({ event, step }) => {
    const { caseId } = event.data;

    const caseData = await step.run('build-case-data', async () => {
      const [caseResult, entitiesResult, statementsResult, timelineResult, contradictionsResult, filesResult] = await Promise.all([
        supabaseAdmin.from('cases').select('name, description').eq('id', caseId).single(),
        supabaseAdmin.from('entities').select('*').eq('case_id', caseId).order('role'),
        supabaseAdmin.from('statements')
          .select(`*, speaker:speaker_entity_id(canonical_name), source_file:source_file_id(filename)`)
          .eq('case_id', caseId)
          .order('statement_date'),
        supabaseAdmin.from('timeline_events').select('*').eq('case_id', caseId).order('event_date').order('event_time'),
        supabaseAdmin.from('contradictions').select('*').eq('case_id', caseId).order('severity'),
        supabaseAdmin.from('case_files').select('id').eq('case_id', caseId).eq('processing_status', 'complete'),
      ]);

      return {
        caseName: caseResult.data?.name || 'Unknown Case',
        description: caseResult.data?.description,
        entities: entitiesResult.data || [],
        statements: (statementsResult.data || []).map(s => ({
          speaker: (s.speaker as any)?.canonical_name || 'Unknown',
          date: s.statement_date,
          content: s.content,
          source: (s.source_file as any)?.filename,
        })),
        timeline: timelineResult.data || [],
        contradictions: contradictionsResult.data || [],
        fileCount: filesResult.data?.length || 0,
      };
    });

    const report = await step.run('generate', async () => {
      return generateCaseBrief(caseData);
    });

    await step.run('store-report', async () => {
      await supabaseAdmin.from('case_reports').insert({
        case_id: caseId,
        report_type: 'full_analysis',
        content: report,
        model_used: AI_MODELS.briefing,
        files_analyzed: caseData.fileCount,
        entities_found: caseData.entities.length,
        contradictions_found: caseData.contradictions.length,
      });
    });

    return { caseId, reportLength: report.length };
  }
);
