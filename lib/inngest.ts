import { Inngest, EventSchemas } from 'inngest';

type Events = {
  'document/uploaded': {
    data: {
      caseId: string;
      fileId: string;
      storagePath: string;
      fileType: string;
      documentType: string;
    };
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
  schemas: new EventSchemas().fromRecord<Events>(),
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
  await inngest.send({ name, data } as any);
}
