import { Inngest } from 'inngest';

type Events = {
  'document/uploaded': {
    data: {
      caseId: string;
      fileId: string;
      importBatchId?: string;
      storagePath: string;
      fileType: string;
      documentType: string;
    };
  };
  'intake/ocr-page-chunk': {
    data: {
      caseId: string;
      fileId: string;
      importBatchId?: string | null;
      storagePath: string;
      kind: 'pdf-scan' | 'image';
      startPage: number;
      endPage: number;
    };
  };
  'analysis/resolve-entities': {
    data: { caseId: string };
  };
  'analysis/detect-contradictions': {
    data: { caseId: string };
  };
  'analysis/generate-report': {
    data: { caseId: string };
  };
};

export const inngest = new Inngest({
  id: 'fresheyes',
  name: 'FreshEyes Cold Case Intelligence',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export async function sendEvent<K extends keyof Events>(
  name: K,
  data: Events[K]['data']
) {
  if (!process.env.INNGEST_EVENT_KEY) {
    console.warn(`[Inngest] Not configured — event not sent: ${name}`);
    return;
  }
  await inngest.send({ name, data });
}
