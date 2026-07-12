export function buildEntityExtractionPrompt(documentType: string, filename: string): string {
  return `You are analyzing a law enforcement document to extract structured information for a cold case investigation.

Document: "${filename}" (type: ${documentType})

The document text below is divided into pages, each marked with a header like [PAGE 3]. Every item you extract MUST cite the page it came from and a short verbatim quote from that page.

Extract all of the following from this document and return a single JSON object:

{
  "entities": [
    {
      "type": "person" | "location" | "organization" | "vehicle" | "evidence_item",
      "name": "canonical full name",
      "aliases": ["other names or abbreviations used in this document"],
      "role": "victim" | "suspect" | "witness" | "investigator" | "mentioned",
      "attributes": {
        // For person: age, gender, occupation, address, phone, physical_description
        // For vehicle: make, model, color, plate_number, year
        // For location: address, type (bar/house/park/etc)
        // For evidence_item: description, condition, location_found, tested (true/false)
      },
      "mentions": [
        { "page": 3, "quote": "short verbatim excerpt where this entity appears" }
      ]
    }
  ],
  "relationships": [
    {
      "from": "person/entity name",
      "to": "person/entity name",
      "type": "knows" | "was_with" | "alibi_for" | "married_to" | "employed_by" | "witnessed" | "owns" | "related_to",
      "description": "specific description from the document",
      "page": 3,
      "quote": "verbatim excerpt supporting this relationship"
    }
  ],
  "statements": [
    {
      "speaker": "person name (null if unknown)",
      "date": "YYYY-MM-DD or null",
      "time": "HH:MM or null",
      "content": "exact quote or close paraphrase of what was said",
      "about": ["names of people/things this statement is about"],
      "page": 3,
      "quote": "verbatim excerpt containing this statement"
    }
  ],
  "timeline_events": [
    {
      "date": "YYYY-MM-DD or null",
      "time": "HH:MM or null",
      "precision": "exact" | "approximate" | "unknown",
      "description": "what happened",
      "people": ["names of people involved"],
      "page": 3,
      "quote": "verbatim excerpt supporting this event"
    }
  ],
  "evidence_items": [
    {
      "label": "short identifying label (e.g. 'kitchen knife', 'Item #12 — blue sweater')",
      "category": "weapon" | "biological" | "fingerprint" | "document" | "clothing" | "digital" | "vehicle" | "other",
      "description": "what it is, condition, where found",
      "status": "collected" | "submitted" | "tested" | "missing" | "unknown",
      "collected_date": "YYYY-MM-DD or null",
      "collected_location": "where it was found/collected, or null",
      "page": 3,
      "quote": "verbatim excerpt about this evidence"
    }
  ],
  "evidence_tests": [
    {
      "evidence_label": "label of the evidence item this result belongs to",
      "test_type": "dna" | "fingerprint" | "ballistics" | "toxicology" | "trace" | "other",
      "result_summary": "what the test found, verbatim where possible",
      "tested_date": "YYYY-MM-DD or null",
      "lab_name": "lab or examiner name, or null",
      "page": 3,
      "quote": "verbatim excerpt reporting this result"
    }
  ],
  "open_loops": [
    {
      "description": "the promised or implied investigative action (e.g. 'Det. Rowe to re-interview neighbor', 'swabs submitted to state lab')",
      "loop_type": "planned_interview" | "lab_submission" | "records_request" | "follow_up" | "canvass" | "other",
      "raised_date": "YYYY-MM-DD or null",
      "people": ["names of people involved"],
      "page": 3,
      "quote": "verbatim excerpt where this action is promised or implied"
    }
  ]
}

Rules:
- Extract EVERY person, place, and notable item mentioned, no matter how briefly
- For names, use the most complete version (e.g. "John Michael Smith" not "John")
- If a person's role is ambiguous, use "mentioned"
- For statements, include both direct quotes and reported speech ("He said he was...")
- For timeline events, include claimed events even if unverified (the contradiction detector will handle conflicts)
- For evidence, extract EVERY physical/digital item collected, mentioned, or referenced — including items referenced but never located
- Record a test result in "evidence_tests" only when the document actually reports one; an evidence item with no located result is an investigative gap the system tracks
- "open_loops" are commitments or implied actions: planned interviews, submissions to labs, records requests, follow-ups ("will contact", "pending", "to be determined")
- "page" must be the number from the [PAGE N] header the supporting text appears under
- "quote" must be copied verbatim from the document (trim to under ~200 characters); never invent or paraphrase quotes
- List every page an entity appears on in its "mentions" array
- Return ONLY valid JSON, no commentary`;
}
