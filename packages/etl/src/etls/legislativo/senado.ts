/**
 * ETL Senado - Senadores Vigentes de Chile
 *
 * Fuente: tramitacion.senado.cl
 * API: senadores_vigentes.php → XML con senadores actuales
 *
 * Tabla destino: senadores (upsert, conflict='id')
 *
 * Migrado de: scripts/etl_senado.py
 */

import { getSupabaseLegislativo } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import {
  fetchWithRetry,
  parseXml,
  ensureArray,
  batchUpsert,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('Senado');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface SenadorXml {
  PARLID: string;
  PARLNOMBRE?: string;
  PARLAPELLIDOPATERNO?: string;
  PARLAPELLIDOMATERNO?: string;
  PARTIDO?: string;
  REGION?: string;
  CIRCUNSCRIPCION?: string;
  EMAIL?: string;
  FONO?: string;
  FOTO?: string;
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runSenado(): Promise<void> {
  log.info('--- Iniciando ETL Senado ---');

  const supabase = getSupabaseLegislativo();

  // 1. Fetch senadores vigentes
  const url = 'https://tramitacion.senado.cl/wspublico/senadores_vigentes.php';

  let xml: string;
  try {
    xml = await fetchWithRetry(url);
  } catch {
    log.error('No se pudo obtener senadores vigentes. Abortando.');
    return;
  }

  const data = parseXml<Record<string, unknown>>(xml);
  const senadoresRaw = ensureArray(
    (data['senadores'] as Record<string, unknown>)?.['senador'] as
      | SenadorXml
      | SenadorXml[]
  );

  if (senadoresRaw.length === 0) {
    log.warn('No se encontraron senadores en la respuesta.');
    return;
  }

  log.info(`Procesando ${senadoresRaw.length} senadores...`);

  // 2. Procesar
  const items: Record<string, unknown>[] = [];

  for (const s of senadoresRaw) {
    try {
      items.push({
        id: parseInt(s.PARLID),
        nombre: s.PARLNOMBRE ?? null,
        apellido_paterno: s.PARLAPELLIDOPATERNO ?? null,
        apellido_materno: s.PARLAPELLIDOMATERNO ?? null,
        partido: s.PARTIDO ?? null,
        region: s.REGION ?? null,
        circunscripcion: s.CIRCUNSCRIPCION ?? null,
        email: s.EMAIL ?? null,
        telefono: s.FONO ?? null,
        url_foto: s.FOTO ?? null,
        updated_at: now(),
      });
    } catch (error) {
      log.error(`Error procesando senador ${s.PARLID}: ${error}`);
    }
  }

  // 3. Upload
  if (items.length > 0) {
    const count = await batchUpsert(supabase, 'senadores', items, {
      onConflict: 'id',
    });
    log.success(`Guardados ${count} senadores.`);
  }

  log.success('--- ETL Senado Finalizado ---');
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runSenado().catch(console.error);
}
