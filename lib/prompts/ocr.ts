export const OCR_PAGE_PROMPT = `Transcribe all text on this page exactly as written. This is a law enforcement document — accuracy is critical. Preserve all names, dates, times, and numbers exactly as they appear. Mark any illegible text as [illegible]. Do not add commentary or interpretation.

Return a single JSON object:

{
  "text": "the full transcription of the page",
  "confidence": 0.0-1.0
}

"confidence" is your honest estimate of transcription accuracy for this page: 1.0 for clean typed text, lower for faded, handwritten, skewed, or partially illegible content. If the page is blank, return {"text": "", "confidence": 1.0}.

Return ONLY the JSON object.`;
