import { NextRequest, NextResponse } from 'next/server';
import { sendEvent } from '@/lib/inngest';
import { authenticateRequest, requireCaseAccess } from '@/lib/api-auth';

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireCaseAccess(ctx, params.caseId))) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  await sendEvent('analysis/detect-contradictions', { caseId: params.caseId });
  return NextResponse.json({ ok: true, message: 'Contradiction detection started' });
}
