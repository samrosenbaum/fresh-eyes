import { SupabaseClient } from '@supabase/supabase-js';
import { mergeEntityFields } from '@/lib/entity-resolution';

// Executes an accepted merge proposal: folds the duplicate entity into the
// primary and rewrites every reference in the graph (mentions, relationships,
// statements, timeline events, contradictions). Returns a snapshot of both
// entities as they were, for the audit record on the proposal.

async function replaceInArrayColumn(
  db: SupabaseClient,
  table: string,
  column: string,
  duplicateId: string,
  primaryId: string,
) {
  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .contains(column, [duplicateId]);

  if (error) throw new Error(`Failed to load ${table}.${column} references: ${error.message}`);

  for (const row of (data || []) as unknown as Array<{ id: string } & Record<string, string[]>>) {
    const updated = Array.from(new Set(
      (row[column] || []).map(id => (id === duplicateId ? primaryId : id)),
    ));
    const { error: updateError } = await db.from(table).update({ [column]: updated }).eq('id', row.id);
    if (updateError) throw new Error(`Failed to rewrite ${table}.${column}: ${updateError.message}`);
  }
}

export async function mergeEntities(db: SupabaseClient, input: {
  caseId: string;
  primaryId: string;
  duplicateId: string;
}) {
  const { caseId, primaryId, duplicateId } = input;
  if (primaryId === duplicateId) throw new Error('Cannot merge an entity into itself');

  const { data: entities, error } = await db
    .from('entities')
    .select('*')
    .eq('case_id', caseId)
    .in('id', [primaryId, duplicateId]);

  if (error) throw new Error(`Failed to load entities: ${error.message}`);
  const primary = entities?.find(e => e.id === primaryId);
  const duplicate = entities?.find(e => e.id === duplicateId);
  if (!primary || !duplicate) throw new Error('One of the entities no longer exists (already merged?)');
  if (primary.type !== duplicate.type) throw new Error('Cannot merge entities of different types');

  const merged = mergeEntityFields(
    { canonicalName: primary.canonical_name, aliases: primary.aliases || [], role: primary.role, attributes: primary.attributes || {} },
    { canonicalName: duplicate.canonical_name, aliases: duplicate.aliases || [], role: duplicate.role, attributes: duplicate.attributes || {} },
  );

  const { error: updateError } = await db.from('entities').update({
    aliases: merged.aliases,
    attributes: merged.attributes,
    role: merged.role,
    updated_at: new Date().toISOString(),
  }).eq('id', primaryId);
  if (updateError) throw new Error(`Failed to update primary entity: ${updateError.message}`);

  // Direct foreign keys
  const directUpdates: Array<[string, string]> = [
    ['entity_mentions', 'entity_id'],
    ['relationships', 'from_entity_id'],
    ['relationships', 'to_entity_id'],
    ['statements', 'speaker_entity_id'],
  ];
  for (const [table, column] of directUpdates) {
    const { error: refError } = await db.from(table).update({ [column]: primaryId }).eq(column, duplicateId);
    if (refError) throw new Error(`Failed to rewrite ${table}.${column}: ${refError.message}`);
  }

  // Relationships that became self-loops after the rewrite are meaningless
  const { error: loopError } = await db
    .from('relationships')
    .delete()
    .eq('from_entity_id', primaryId)
    .eq('to_entity_id', primaryId);
  if (loopError) throw new Error(`Failed to remove self-loop relationships: ${loopError.message}`);

  // uuid[] columns
  await replaceInArrayColumn(db, 'statements', 'about_entity_ids', duplicateId, primaryId);
  await replaceInArrayColumn(db, 'timeline_events', 'involved_entity_ids', duplicateId, primaryId);
  await replaceInArrayColumn(db, 'contradictions', 'involved_entity_ids', duplicateId, primaryId);

  const { error: deleteError } = await db.from('entities').delete().eq('id', duplicateId);
  if (deleteError) throw new Error(`Failed to delete duplicate entity: ${deleteError.message}`);

  return { snapshot: { primary, duplicate } };
}
