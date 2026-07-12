import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest';
import { processDocumentJob } from '@/lib/jobs/process-document';
import { ocrPageChunkJob } from '@/lib/jobs/ocr-page-chunk';
import { detectContradictionsJob } from '@/lib/jobs/detect-contradictions';
import { generateReportJob } from '@/lib/jobs/generate-report';

export const maxDuration = 300;

const handler = serve({
  client: inngest,
  functions: [processDocumentJob, ocrPageChunkJob, detectContradictionsJob, generateReportJob],
  streaming: true,
});

export { handler as GET, handler as POST, handler as PUT };
