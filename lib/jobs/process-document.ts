import { NonRetriableError } from 'inngest';
import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';
import { extractCaseGraphFromDocument, ExtractedCaseGraph, SourcePageText } from '@/lib/ai/tasks/extract-case-graph';
import { segmentDocumentPages } from '@/lib/ai/tasks/segment-document';
import { updateImportBatchRollup } from '@/lib/import-batches';
import { prepareVerificationPages, verifyQuote, SourceVerificationStatus } from '@/lib/source-verification';
import { downloadFile, getPdfPageCount, loadStoredPages, storePage, IMAGE_MEDIA_TYPES } from '@/lib/intake/pages';
import { ocrPageChunkJob } from '@/lib/jobs/ocr-page-chunk';
import { DocumentSegment } from '@/lib/intake/segments';

// Pages per fanned-out OCR invocation. Small enough that a retry redoes only
// a few AI calls; the ocr-page-chunk function's concurrency limit governs how
// many run at once across the whole system.
const PAGES_PER_OCR_CHUNK = 3;

// Confidence assigned to extracted facts by source-verification outcome:
// a quote confirmed on its cited page is trustworthy; one we couldn't find
// in the document at all needs human review before anyone relies on it.
const VERIFICATION_CONFIDENCE: Record<SourceVerificationStatus, number> = {
  verified: 0.9,
  relocated: 0.8,
  unverified: 0.4,
};

type FilePlan = {
  kind: 'pdf-text' | 'pdf-scan' | 'image';
  pageCount: number;
  // true when pages were already stored during classification (digital PDFs)
  pagesStored: boolean;
};

// ── Entity Deduplication ────────────────────────────────────────────────────

async function resolveOrCreateEntity(
  caseId: string,
  extracted: ExtractedCaseGraph['entities'][0]
): Promise<string> {
  // Look for exact name match or alias match
  const { data: existing } = await supabaseAdmin
    .from('entities')
    .select('id, canonical_name, aliases, attributes, role')
    .eq('case_id', caseId)
    .eq('type', extracted.type);

  if (existing) {
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
    triggers: { event: 'document/uploaded' },
    onFailure: async ({ event }) => {
      // All retries exhausted — surface the error on the file and batch so
      // intake never hangs in 'processing'.
      const original = event.data.event.data;
      const message = event.data.error?.message || 'Processing failed';

      await supabaseAdmin.from('case_files').update({
        processing_status: 'failed',
        processing_error: message,
      }).eq('id', original.fileId);

      if (original.importBatchId) {
        await updateImportBatchRollup(supabaseAdmin, original.caseId, original.importBatchId);
      }
    },
  },
  async ({ event, step }) => {
    const { caseId, fileId, importBatchId, storagePath, fileType, documentType } = event.data;

    // Mark as processing
    await step.run('mark-processing', async () => {
      await supabaseAdmin.from('case_files').update({
        processing_status: 'processing',
      }).eq('id', fileId);
      if (importBatchId) {
        await supabaseAdmin.from('import_batches').update({ status: 'processing' }).eq('id', importBatchId);
      }
    });

    // Classify the file and, for digital PDFs, store real per-page text
    // immediately. The raw file buffer never crosses a step boundary (Inngest
    // caps step output size) — workers re-download from storage as needed.
    const plan = await step.run('classify-file', async (): Promise<FilePlan> => {
      const ext = storagePath.split('.').pop()?.toLowerCase() || '';
      const isPdf = fileType === 'pdf' || ext === 'pdf';

      if (isPdf) {
        const buffer = await downloadFile(storagePath);

        // Digital PDFs: native text extraction gives exact per-page text.
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: new Uint8Array(buffer) });
          const result = await parser.getText();
          await parser.destroy();

          if ((result.text?.trim().length || 0) > 100) {
            for (const page of result.pages) {
              await storePage({
                caseId, fileId, importBatchId,
                pageNumber: page.num,
                text: page.text?.trim() || '',
                confidence: 0.98,
                method: 'pdf-text',
              });
            }
            return { kind: 'pdf-text', pageCount: result.total, pagesStored: true };
          }
        } catch {
          // fall through to vision OCR
        }

        return { kind: 'pdf-scan', pageCount: await getPdfPageCount(buffer), pagesStored: false };
      }

      if (IMAGE_MEDIA_TYPES[ext] || fileType === 'image') {
        return { kind: 'image', pageCount: 1, pagesStored: false };
      }

      throw new NonRetriableError(`Unsupported file type: ${fileType || ext || 'unknown'}`);
    });

    // Fan out vision OCR: each page chunk runs as its own invocation of the
    // ocr-page-chunk function, in parallel, governed by that function's
    // global concurrency limit.
    if (!plan.pagesStored) {
      const invocations = [];
      for (let start = 1; start <= plan.pageCount; start += PAGES_PER_OCR_CHUNK) {
        const end = Math.min(start + PAGES_PER_OCR_CHUNK - 1, plan.pageCount);
        invocations.push(
          step.invoke(`ocr-pages-${start}-${end}`, {
            function: ocrPageChunkJob,
            data: {
              caseId, fileId, importBatchId, storagePath,
              kind: plan.kind as 'pdf-scan' | 'image',
              startPage: start,
              endPage: end,
            },
          }),
        );
      }
      await Promise.all(invocations);
    }

    // Roll page text up to the file record (full-document search/back-compat).
    await step.run('finalize-ocr', async () => {
      const pages = await loadStoredPages(fileId);
      await supabaseAdmin.from('case_files').update({
        ocr_text: pages.map(p => p.ocr_text || '').join('\n\n'),
        ocr_method: plan.kind === 'pdf-text' ? 'pdf-text' : 'ai-vision',
        page_count: pages.length,
      }).eq('id', fileId);
    });

    // Detect logical document boundaries: one scanned file often contains
    // many distinct documents (reports, statements, tips). Segments are
    // persisted as case_documents and drive per-document extraction.
    const segments = await step.run('segment-document', async (): Promise<DocumentSegment[]> => {
      const [pages, fileRes] = await Promise.all([
        loadStoredPages(fileId),
        supabaseAdmin.from('case_files').select('filename').eq('id', fileId).single(),
      ]);

      const detected = await segmentDocumentPages({
        pages: pages.map(p => ({ pageNumber: p.page_number, text: p.ocr_text })),
        filename: fileRes.data?.filename || storagePath,
        uploadedDocType: documentType,
      });

      // Replace previous segmentation for this file (idempotent on retry).
      const { error: clearError } = await supabaseAdmin.from('case_documents').delete().eq('file_id', fileId);
      if (clearError) throw new Error(`Failed to clear previous segments: ${clearError.message}`);

      for (const segment of detected) {
        const { error } = await supabaseAdmin.from('case_documents').insert({
          case_id: caseId,
          file_id: fileId,
          import_batch_id: importBatchId || null,
          title: segment.title,
          document_type: segment.documentType,
          start_page: segment.startPage,
          end_page: segment.endPage,
          confidence: segment.confidence,
        });
        if (error) throw new Error(`Failed to store segment: ${error.message}`);
      }

      return detected;
    });

    // Extract each detected document in parallel — page-tagged text so every
    // item cites a real page, bounded per document instead of per file.
    const extractions = await Promise.all(
      segments.map((segment, index) =>
        step.run(`extract-doc-${index + 1}-p${segment.startPage}-${segment.endPage}`, async () => {
          const pages = await loadStoredPages(fileId);
          const segmentPages: SourcePageText[] = pages
            .filter(p => p.page_number >= segment.startPage && p.page_number <= segment.endPage)
            .map(p => ({ pageNumber: p.page_number, text: p.ocr_text || '' }));

          return extractCaseGraphFromDocument({
            pages: segmentPages,
            documentType: segment.documentType,
            filename: segment.title,
          });
        }),
      ),
    );

    // Store everything in the graph with page-level provenance. Every quote
    // is checked against the stored page text; the row records whether the
    // citation was verified, found on a different page, or not found at all.
    const totals = await step.run('store-graph', async () => {
      const pages = await loadStoredPages(fileId);
      const pageIdByNumber: Record<number, string> = {};
      for (const page of pages) pageIdByNumber[page.page_number] = page.id;
      const fallbackPageId = pages[0]?.id || null;

      const verificationPages = prepareVerificationPages(
        pages.map(p => ({ pageNumber: p.page_number, text: p.ocr_text })),
      );

      const resolvePageId = (pageNumber: number | null | undefined): string | null => {
        if (typeof pageNumber === 'number' && pageIdByNumber[pageNumber]) return pageIdByNumber[pageNumber];
        return fallbackPageId;
      };

      // Verified provenance fields shared by every extracted row.
      const citeSource = (quote: string | null | undefined, citedPage: number | null | undefined) => {
        const result = verifyQuote(quote, citedPage, verificationPages);
        return {
          source_page_id: resolvePageId(result.pageNumber),
          source_quote: quote || null,
          source_verification: result.status,
          confidence: VERIFICATION_CONFIDENCE[result.status],
          verifiedPageNumber: result.pageNumber,
        };
      };

      // Replace this file's previous extraction output so Inngest retries and
      // manual reprocessing never duplicate graph rows. Entities are shared
      // across the case (merged, not owned by one file) so they stay.
      const cleanups = await Promise.all([
        supabaseAdmin.from('entity_mentions').delete().eq('file_id', fileId),
        supabaseAdmin.from('relationships').delete().eq('source_file_id', fileId),
        supabaseAdmin.from('statements').delete().eq('source_file_id', fileId),
        supabaseAdmin.from('timeline_events').delete().eq('source_file_id', fileId),
      ]);
      for (const cleanup of cleanups) {
        if (cleanup.error) throw new Error(`Failed to clear previous extraction: ${cleanup.error.message}`);
      }

      // Entity name → id map shared across segments so the same person in a
      // report and a tip resolves to one entity.
      const entityIdMap: Record<string, string> = {};
      let entityCount = 0;

      for (let segmentIndex = 0; segmentIndex < extractions.length; segmentIndex++) {
        const extracted = extractions[segmentIndex];
        const segmentType = segments[segmentIndex]?.documentType || documentType;

        for (const entity of extracted.entities) {
          const id = await resolveOrCreateEntity(caseId, entity);
          if (!entityIdMap[entity.name.toLowerCase()]) entityCount++;
          entityIdMap[entity.name.toLowerCase()] = id;
          for (const alias of entity.aliases || []) {
            entityIdMap[alias.toLowerCase()] = id;
          }

          // One mention row per cited page, with the verbatim quote.
          const citations = entity.mentions?.length
            ? entity.mentions
            : [{ page: null as number | null, quote: null as string | null }];

          for (const citation of citations.slice(0, 25)) {
            const cited = citeSource(citation.quote, citation.page);
            const { error } = await supabaseAdmin.from('entity_mentions').insert({
              entity_id: id,
              file_id: fileId,
              page_number: cited.verifiedPageNumber ?? citation.page ?? null,
              source_page_id: cited.source_page_id,
              context_text: `Mentioned in ${segmentType}`,
              source_quote: cited.source_quote,
              source_verification: cited.source_verification,
              confidence: cited.confidence,
              review_status: 'pending',
            });
            if (error) throw new Error(`Failed to store entity mention: ${error.message}`);
          }
        }

        const resolveEntityId = (name: string): string | null => {
          return entityIdMap[name?.toLowerCase()] || null;
        };

        // Relationships
        for (const rel of extracted.relationships) {
          const fromId = resolveEntityId(rel.from);
          const toId = resolveEntityId(rel.to);
          if (fromId && toId) {
            const cited = citeSource(rel.quote, rel.page);
            const { error } = await supabaseAdmin.from('relationships').insert({
              case_id: caseId,
              from_entity_id: fromId,
              to_entity_id: toId,
              relationship_type: rel.type,
              description: rel.description,
              source_file_id: fileId,
              source_page_id: cited.source_page_id,
              source_quote: cited.source_quote,
              source_verification: cited.source_verification,
              confidence: cited.confidence,
            });
            if (error) throw new Error(`Failed to store relationship: ${error.message}`);
          }
        }

        // Statements
        for (const stmt of extracted.statements) {
          const speakerId = stmt.speaker ? resolveEntityId(stmt.speaker) : null;
          const aboutIds = (stmt.about || []).map(resolveEntityId).filter(Boolean) as string[];
          const cited = citeSource(stmt.quote, stmt.page);
          const { error } = await supabaseAdmin.from('statements').insert({
            case_id: caseId,
            speaker_entity_id: speakerId,
            source_file_id: fileId,
            statement_date: stmt.date || null,
            statement_time: stmt.time || null,
            content: stmt.content,
            about_entity_ids: aboutIds,
            source_page_id: cited.source_page_id,
            source_quote: cited.source_quote,
            source_verification: cited.source_verification,
            confidence: cited.confidence,
            review_status: 'pending',
          });
          if (error) throw new Error(`Failed to store statement: ${error.message}`);
        }

        // Timeline events
        for (const timelineEvent of extracted.timeline_events) {
          const involvedIds = (timelineEvent.people || []).map(resolveEntityId).filter(Boolean) as string[];
          const cited = citeSource(timelineEvent.quote, timelineEvent.page);
          const { error } = await supabaseAdmin.from('timeline_events').insert({
            case_id: caseId,
            event_date: timelineEvent.date || null,
            event_time: timelineEvent.time || null,
            time_precision: timelineEvent.precision || 'unknown',
            description: timelineEvent.description,
            involved_entity_ids: involvedIds,
            source_file_id: fileId,
            source_page_id: cited.source_page_id,
            source_quote: cited.source_quote,
            source_verification: cited.source_verification,
            confidence: cited.confidence,
          });
          if (error) throw new Error(`Failed to store timeline event: ${error.message}`);
        }
      }

      return { entityCount };
    });

    // Mark complete and roll up batch counts.
    await step.run('mark-complete', async () => {
      await supabaseAdmin.from('case_files').update({
        processing_status: 'complete',
        processing_error: null,
        processed_at: new Date().toISOString(),
      }).eq('id', fileId);

      if (importBatchId) {
        await updateImportBatchRollup(supabaseAdmin, caseId, importBatchId);
      }
    });

    return {
      fileId,
      pageCount: plan.pageCount,
      documentsDetected: segments.length,
      entityCount: totals.entityCount,
    };
  }
);
