/**
 * Batch upsert/insert utilities para Supabase
 * Replica el patrón Python de batch de 100 registros
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from './logger.js';

const log = createLogger('Batch');

const DEFAULT_BATCH_SIZE = 100;

export interface UpsertOptions {
  onConflict: string;         // Column name for conflict resolution
  ignoreDuplicates?: boolean; // Skip duplicates silently
  batchSize?: number;         // Default: 100
}

/**
 * Upsert datos en batches de N registros.
 * Replica: supabase.table(x).upsert(data, on_conflict='col').execute()
 */
export async function batchUpsert(
  client: SupabaseClient,
  table: string,
  data: Record<string, unknown>[],
  options: UpsertOptions
): Promise<number> {
  const { onConflict, ignoreDuplicates = false, batchSize = DEFAULT_BATCH_SIZE } = options;
  let totalInserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    try {
      const { error } = await client
        .from(table)
        .upsert(batch, {
          onConflict,
          ignoreDuplicates,
        });

      if (error) {
        log.error(`Error upserting batch ${i / batchSize + 1} to ${table}: ${error.message}`);
      } else {
        totalInserted += batch.length;
      }
    } catch (err) {
      log.error(`Exception upserting batch to ${table}: ${err}`);
    }
  }

  return totalInserted;
}

/**
 * Insert datos en batches de N registros (sin manejo de conflicto).
 * Replica: supabase.table(x).insert(data).execute()
 */
export async function batchInsert(
  client: SupabaseClient,
  table: string,
  data: Record<string, unknown>[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<number> {
  let totalInserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    try {
      const { error } = await client.from(table).insert(batch);

      if (error) {
        log.error(`Error inserting batch ${i / batchSize + 1} to ${table}: ${error.message}`);
      } else {
        totalInserted += batch.length;
      }
    } catch (err) {
      log.error(`Exception inserting batch to ${table}: ${err}`);
    }
  }

  return totalInserted;
}
