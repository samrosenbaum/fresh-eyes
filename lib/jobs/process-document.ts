import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';
import { anthropic, ANALYSIS_MODEL } from '@/lib/anthropic';
import { OCR_PROMPT } from '@/lib/prompts/ocr';
import { buildEntityExtractionPrompt } from '@/lib/prompts/entity-extraction';

// ── OCR ────────────────────────────────────────────────────────────────────

async function ocrWithClaude(imageBuffer: Buffer, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<string> {
  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') } },
        { type: 'text', text: OCR_PROMPT },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; method: string; pageCount: number }> {
  // Try native text extraction first (fast, for digital PDFs)
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    const text = data.text?.trim() || '';
    if (text.length > 100) {
      return { text, method: 'pdf-text', pageCount: data.numpages };
    }
  } catch {
    // fall through to Claude vision
  }

  // Scanned PDF — use Claude vision on each page image
  // We'll send the whole PDF as an image if it's small enough, otherwise page by page
  // For simplicity, convert to base64 and send first page via Claude
  // Production would use pdf2pic to rasterize each page
  const base64 = buffer.toString('base64');
  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        { type: 'text', text: OCR_PROMPT },
      ],
    }],
  });
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return { text, method: 'claude-vision', pageCount: 1 };
}

async function performOcr(buffer: Buffer, fileType: string, storagePath: string): Promise<{ text: string; method: string; pageCount: number }> {
  const ext = storagePath.split('.').pop()?.toLowerCase() || '';

  if (fileType === 'pdf' || ext === 'pdf') {
    return extractPdfText(buffer);
  }

  // Image files
  const mediaTypeMap: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const mediaType = mediaTypeMap[ext] || 'image/jpeg';
  const text = await ocrWithClaude(buffer, mediaType);
  return { text, method: 'claude-vision', pageCount: 1 };
}

// ── Entity Extraction ───────────────────────────────────────────────────────

interface ExtractedData {
  entities: Array<{
    type: string;
    name: string;
    aliases: string[];
    role: string;
    attributes: Record<string, any>;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    description: string;
  }>;
  statements: Array<{
    speaker: string | null;
    date: string | null;
    time: string | null;
    content: string;
    about: string[];
  }>;
  timeline_events: Array<{
    date: string | null;
    time: string | null;
    precision: string;
    description: string;
    people: string[];
  }>;
}

async function extractEntities(text: string, documentType: string, filename: string): Promise<ExtractedData> {
  const prompt = buildEntityExtractionPrompt(documentType, filename);
  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8192,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: `Here is the document text to analyze:\n\n${text}\n\nExtracted JSON:` },
    ],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    // Strip any markdown code fences
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    console.error('[process-document] Failed to parse entity extraction JSON:', content.slice(0, 500));
    return { entities: [], relationships: [], statements: [], timeline_events: [] };
  }
}

// ── Entity Deduplication ────────────────────────────────────────────────────

async function resolveOrCreateEntity(
  caseId: string,
  extracted: ExtractedData['entities'][0]
): Promise<string> {
  // Look for exact name match or alias match
  const { data: existing } = await supabaseAdmin
    .from('entities')
    .select('id, canonical_name, aliases, attributes, role')
    .eq('case_id', caseId)
    .eq('type', extracted.type);

  if (existing) {
    const nameLower = extracted.name.toLowerCase();
    const match = existing.find(e => {
      const existingNames = [e.canonical_name, ...(e.aliases || [])].map((n: string) => n.toLowerCase());
      const extractedNames = [extracted.name, ...(extracted.aliases || [])].map(n => n.toLowerCase());
      return existingNames.some(n => extractedNames.includes(n));
    });

    if (match) {
      // Merge: add new aliases, update attributes
      const mergedAliases = Array.from(new Set([
        ...(match.aliases || []),
        ...extracted.aliases,
        extracted.name !== match.canonical_name ? extracted.name : null,
      ].filter(Boolean)));
      const mergedAttributes = { ...match.attributes, ...extracted.attributes };
      // Upgrade role if more specific (victim/suspect > witness > mentioned)
      const roleRank = { victim: 5, suspect: 4, witness: 3, investigator: 2, mentioned: 1 };
      const newRole = (roleRank[extracted.role as keyof typeof roleRank] || 1) > (roleRank[match.role as keyof typeof roleRank] || 1)
        ? extracted.role : match.role;

      await supabaseAdmin.from('entities').update({
        aliases: mergedAliases,
        attributes: mergedAttributes,
        role: newRole,
        updated_at: new Date().toISOString(),
      }).eq('id', match.id);

      return match.id;
    }
  }

  // Create new entity
  const { data, error } = await supabaseAdmin.from('entities').insert({
    case_id: caseId,
    type: extracted.type,
    canonical_name: extracted.name,
    aliases: extracted.aliases || [],
    role: extracted.role || 'mentioned',
    attributes: extracted.attributes || {},
  }).select('id').single();

  if (error) throw new Error(`Failed to create entity: ${error.message}`);
  return data.id;
}

// ── Main Job ────────────────────────────────────────────────────────────────

export const processDocumentJob = inngest.createFunction(
  {
    id: 'process-document',
    name: 'Process Case Document',
    retries: 2,
    concurrency: { limit: 3 },
  },
  { event: 'document/uploaded' },
  async ({ event, step }) => {
    const { caseId, fileId, storagePath, fileType, documentType } = event.data;

    // Mark as processing
    await step.run('mark-processing', async () => {
      await supabaseAdmin.from('case_files').update({
        processing_status: 'processing',
      }).eq('id', fileId);
    });

    // Download file from storage
    const buffer = await step.run('download-file', async () => {
      const { data, error } = await supabaseAdmin.storage.from('case-files').download(storagePath);
      if (error) throw new Error(`Failed to download file: ${error.message}`);
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64'); // serialize for Inngest
    });

    // OCR
    const { text, method, pageCount } = await step.run('ocr', async () => {
      const buf = Buffer.from(buffer, 'base64');
      return performOcr(buf, fileType, storagePath);
    });

    // Store OCR result
    await step.run('store-ocr', async () => {
      await supabaseAdmin.from('case_files').update({
        ocr_text: text,
        ocr_method: method,
        page_count: pageCount,
      }).eq('id', fileId);
    });

    // Extract entities, relationships, statements, timeline
    const extracted = await step.run('extract-entities', async () => {
      const { data: file } = await supabaseAdmin.from('case_files').select('filename').eq('id', fileId).single();
      return extractEntities(text, documentType, file?.filename || storagePath);
    });

    // Store everything in graph
    await step.run('store-graph', async () => {
      // Build entity name → id map
      const entityIdMap: Record<string, string> = {};

      for (const entity of extracted.entities) {
        const id = await resolveOrCreateEntity(caseId, entity);
        entityIdMap[entity.name.toLowerCase()] = id;
        for (const alias of entity.aliases || []) {
          entityIdMap[alias.toLowerCase()] = id;
        }
      }

      const resolveEntityId = (name: string): string | null => {
        return entityIdMap[name?.toLowerCase()] || null;
      };

      // Entity mentions (each entity gets a mention on this file)
      for (const [entityName, entityId] of Object.entries(entityIdMap)) {
        await supabaseAdmin.from('entity_mentions').insert({
          entity_id: entityId,
          file_id: fileId,
          context_text: `Mentioned in ${documentType}`,
        }).then(() => {}); // ignore duplicates
      }

      // Relationships
      for (const rel of extracted.relationships) {
        const fromId = resolveEntityId(rel.from);
        const toId = resolveEntityId(rel.to);
        if (fromId && toId) {
          await supabaseAdmin.from('relationships').insert({
            case_id: caseId,
            from_entity_id: fromId,
            to_entity_id: toId,
            relationship_type: rel.type,
            description: rel.description,
            source_file_id: fileId,
          });
        }
      }

      // Statements
      for (const stmt of extracted.statements) {
        const speakerId = stmt.speaker ? resolveEntityId(stmt.speaker) : null;
        const aboutIds = (stmt.about || []).map(resolveEntityId).filter(Boolean) as string[];
        await supabaseAdmin.from('statements').insert({
          case_id: caseId,
          speaker_entity_id: speakerId,
          source_file_id: fileId,
          statement_date: stmt.date || null,
          statement_time: stmt.time || null,
          content: stmt.content,
          about_entity_ids: aboutIds,
        });
      }

      // Timeline events
      for (const event of extracted.timeline_events) {
        const involvedIds = (event.people || []).map(resolveEntityId).filter(Boolean) as string[];
        await supabaseAdmin.from('timeline_events').insert({
          case_id: caseId,
          event_date: event.date || null,
          event_time: event.time || null,
          time_precision: event.precision || 'unknown',
          description: event.description,
          involved_entity_ids: involvedIds,
          source_file_id: fileId,
        });
      }
    });

    // Mark complete
    await step.run('mark-complete', async () => {
      await supabaseAdmin.from('case_files').update({
        processing_status: 'complete',
        processed_at: new Date().toISOString(),
      }).eq('id', fileId);
    });

    return { fileId, entityCount: extracted.entities.length };
  }
);
