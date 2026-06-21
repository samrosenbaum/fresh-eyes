export function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const starts = [firstObject, firstArray].filter(index => index >= 0);
  if (!starts.length) return trimmed;

  const start = Math.min(...starts);
  const opener = trimmed[start];
  const closer = opener === '[' ? ']' : '}';
  const end = trimmed.lastIndexOf(closer);

  if (end > start) return trimmed.slice(start, end + 1).trim();
  return trimmed;
}

export function parseJsonOrFallback<T>(text: string, fallback: T, onError?: (payload: string) => void): T {
  const payload = extractJsonPayload(text);
  try {
    return JSON.parse(payload) as T;
  } catch {
    onError?.(payload);
    return fallback;
  }
}
