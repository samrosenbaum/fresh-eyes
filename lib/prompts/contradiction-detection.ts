export function buildContradictionPrompt(caseData: {
  caseName: string;
  entities: any[];
  relationships: any[];
  statements: any[];
  timeline: any[];
}): string {
  return `You are an experienced cold case detective reviewing a case with completely fresh eyes. You have no prior assumptions about this case.

CASE: ${caseData.caseName}

PERSONS & ENTITIES:
${JSON.stringify(caseData.entities, null, 2)}

KNOWN RELATIONSHIPS:
${JSON.stringify(caseData.relationships, null, 2)}

STATEMENTS ON RECORD:
${JSON.stringify(caseData.statements, null, 2)}

RECONSTRUCTED TIMELINE:
${JSON.stringify(caseData.timeline, null, 2)}

Your job: Find everything that doesn't add up. Be thorough and skeptical. Look for:

1. **ALIBI CONFLICTS** — Someone claims to be somewhere, but another source places them elsewhere at the same time
2. **STATEMENT CONFLICTS** — Two people give incompatible accounts of the same event
3. **TIMELINE IMPOSSIBILITIES** — Someone couldn't physically travel between locations in the claimed time
4. **EVOLVING STORIES** — A person's account changes between interviews (look for inconsistencies across statements)
5. **UNINTERVIEWED PERSONS** — People mentioned multiple times who appear to have no recorded statement
6. **MISSING FOLLOW-UPS** — Evidence mentioned as "to be tested," "pending lab results," or "will be followed up" with no apparent resolution
7. **SUSPICIOUS OMISSIONS** — A key person who appears frequently in early documents but disappears from later ones
8. **MOTIVE INDICATORS** — Relationships or financial/personal circumstances that suggest motive but weren't apparently investigated
9. **OVERLOOKED PHYSICAL EVIDENCE** — Items mentioned but apparently never submitted for forensic analysis

Return a JSON array of findings:
[
  {
    "type": "alibi_conflict" | "statement_conflict" | "timeline_conflict" | "uninterviewed_person" | "missing_followup" | "suspicious_omission" | "motive_indicator" | "physical_impossibility",
    "severity": "critical" | "high" | "medium" | "low",
    "title": "Short, specific title (e.g. 'Smith alibi contradicted by Martinez statement')",
    "description": "Detailed explanation of what doesn't add up and why it matters",
    "evidence": {
      "quotes": ["exact quotes from statements that demonstrate the contradiction"],
      "entity_names": ["names of people/items involved"]
    }
  }
]

Be specific. Reference exact names, dates, and quotes. Return ONLY the JSON array, no preamble.`;
}
