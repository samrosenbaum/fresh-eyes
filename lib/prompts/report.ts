export function buildReportPrompt(caseData: {
  caseName: string;
  description?: string;
  entities: any[];
  statements: any[];
  timeline: any[];
  contradictions: any[];
  fileCount: number;
}): string {
  return `You are a cold case review specialist preparing a formal briefing for an investigative team reopening a cold case. Your job is to synthesize all available information and produce a structured, actionable report.

CASE: ${caseData.caseName}
${caseData.description ? `DESCRIPTION: ${caseData.description}` : ''}
FILES ANALYZED: ${caseData.fileCount}

PERSONS OF INTEREST AND KEY ENTITIES:
${JSON.stringify(caseData.entities, null, 2)}

WITNESS AND SUBJECT STATEMENTS:
${JSON.stringify(caseData.statements, null, 2)}

RECONSTRUCTED TIMELINE:
${JSON.stringify(caseData.timeline, null, 2)}

DETECTED CONTRADICTIONS AND ANOMALIES:
${JSON.stringify(caseData.contradictions, null, 2)}

Write a comprehensive investigation briefing with the following sections:

## Case Summary
What we know happened, based on the available documents. Be factual, note confidence levels.

## Key Persons of Interest
For each significant person: what we know about them, their role, why they warrant attention. Flag anyone who was mentioned but apparently never formally interviewed.

## Critical Contradictions
The most significant inconsistencies, ranked by importance. For each: what the contradiction is, which statements conflict, and why it matters to the investigation.

## Overlooked Leads
- People mentioned who appear never to have been interviewed
- Physical evidence mentioned but apparently never tested or followed up
- Relationships or motives that appear underinvestigated
- Gaps in the timeline that were never explained

## Recommended Next Steps
Specific, actionable investigative actions in priority order. Be concrete: name specific people to interview, specific evidence to test, specific records to obtain.

## Questions This Case Must Answer
The most critical unanswered questions that any reinvestigation must resolve.

Write clearly and directly. This is for working investigators, not a jury. Reference specific names and evidence. Do not hedge unnecessarily — state what the evidence suggests.`;
}
