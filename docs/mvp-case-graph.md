# MVP: Cold Case Graph Builder

## MVP Promise

Upload a messy digital case packet. Fresh Eyes organizes it into a source-cited investigative graph, timeline, evidence map, and gap list.

The MVP is not “AI solves the case.” It is “AI structures the case so detectives can think faster.”

## Target Inputs

- Police reports
- Supplemental reports
- Interviews and witness statements
- Evidence logs
- Lab reports
- Autopsy or medical reports
- Tips
- Photos and scanned images
- Giant PDFs or many small files

## Initial Outputs

### Intake Summary

- Files uploaded
- Pages processed
- Documents detected
- Duplicate or near-duplicate pages
- Low-confidence OCR pages
- Referenced-but-missing documents

### Case Graph Summary

- People identified
- Key witnesses
- Suspects or persons of interest
- Locations
- Vehicles
- Evidence items
- Statements
- Timeline events
- Potential investigative gaps

### Investigator Views

1. **Brief** — concise source-cited orientation to the case.
2. **People** — canonical entities, aliases, roles, mentions, and relationships.
3. **Timeline** — chronological events with involved entities and source links.
4. **Evidence** — inventory, testing status, lab-result references, and gaps.
5. **Gaps** — missing interviews, missing lab results, unresolved follow-ups, timeline gaps, and missing documents.
6. **Documents** — import batches, processing state, OCR confidence, and source pages.

## First “Holy Shit” Moment

Fresh Eyes should quickly answer:

- Who matters?
- What happened when?
- What evidence exists?
- What evidence has no located result?
- Which people appear repeatedly but lack statements?
- Which documents or lab results are referenced but missing?
- Which timeline windows are unexplained?
- Where did every fact come from?

## MVP Build Sequence

1. Stabilize the existing app and case dashboard.
2. Add import batches and page-level document processing.
3. Add universal source provenance for extracted facts.
4. Improve entity extraction and resolution.
5. Add relationship and timeline extraction with review states.
6. Add first-class evidence inventory and evidence testing tables.
7. Add gap detection for missing lab results, missing interviews, unresolved follow-ups, and missing referenced documents.
8. Add a case brief that summarizes the graph without making unsupported conclusions.
9. Move specialized workflows into durable agents after the schemas and task contracts are stable.

## Non-Goals for MVP

- No unsupported claims about guilt.
- No fully autonomous “case solving.”
- No polished graph visualization before the underlying graph is reliable.
- No durable agent migration before the schema, provenance model, and AI task contracts are clear.
