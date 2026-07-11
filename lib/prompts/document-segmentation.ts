export function buildDocumentSegmentationPrompt(filename: string, uploadedDocType: string): string {
  return `You are organizing a scanned law enforcement case file for a cold case investigation.

File: "${filename}" (uploader labeled it: ${uploadedDocType})

Scanned case files often contain MANY distinct documents in one file: police reports, supplemental reports, witness statements, interview transcripts, autopsy/medical reports, evidence logs, lab reports, handwritten tips and notes, and photos. Below is a one-line snippet from each page, in order. Identify where each distinct document starts and ends.

Return a single JSON array:

[
  {
    "title": "short descriptive title (e.g. 'Initial incident report', 'Interview — Maria Lopez')",
    "document_type": "police_report" | "witness_statement" | "interview" | "autopsy" | "evidence_log" | "lab_report" | "tip" | "photo" | "other",
    "start_page": 1,
    "end_page": 4,
    "confidence": 0.0-1.0
  }
]

Rules:
- Segments must be in page order and must not overlap
- Together they must cover every page listed (a continuation page belongs to the document it continues)
- Look for boundary signals: new letterheads, form headers, case/report numbers, "Page 1 of N", signature blocks followed by a new heading, abrupt topic or format changes
- Handwritten tip notes are usually short (often a single page) — type "tip"
- If the whole file is clearly one document, return a single segment
- "confidence" reflects how sure you are about that segment's boundaries and type
- Return ONLY the JSON array, no commentary`;
}
