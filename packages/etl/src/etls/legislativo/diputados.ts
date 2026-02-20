/**
 * ETL Diputados - Cámara de Diputados de Chile
 *
 * Fuente: opendata.camara.cl
 * API: getDiputados_Vigentes → XML con diputados actuales
 *
 * Tabla destino: diputados (upsert, conflict='id')
 *
 * Migrado de: scripts/etl_diputados.py
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

const log = createLogger('Diputados');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface DiputadoXml {
  DIPID: string;
  Nombre?: string;
  Apellido_Paterno?: string;
  Apellido_Materno?: string;
  Militancias_Periodos?: {
    Militancia?: MilitanciaXml | MilitanciaXml[];
  };
}

interface MilitanciaXml {
  Partido?: string;
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runDiputados(): Promise<void> {
  log.info('--- Iniciando ETL Cámara de Diputados ---');

  const supabase = getSupabaseLegislativo();

  // 1. Fetch diputados vigentes
  const url =
    'https://opendata.camara.cl/wscamaradiputados.asmx/getDiputados_Vigentes';

  let xml: string;
  try {
    xml = await fetchWithRetry(url);
  } catch {
    log.error('No se pudo obtener diputados vigentes. Abortando.');
    return;
  }

  const data = parseXml<Record<string, unknown>>(xml);
  const diputadosRaw = ensureArray(
    (data['Diputados'] as Record<string, unknown>)?.['Diputado'] as
      | DiputadoXml
      | DiputadoXml[]
  );

  if (diputadosRaw.length === 0) {
    log.warn('No se encontraron diputados en la respuesta.');
    return;
  }

  log.info(`Procesando ${diputadosRaw.length} diputados...`);

  // 2. Procesar cada diputado
  const items: Record<string, unknown>[] = [];

  for (const d of diputadosRaw) {
    try {
      // Extraer partido de la última militancia vigente
      let partido: string | null = null;
      const militancias = ensureArray(
        d.Militancias_Periodos?.Militancia as
          | MilitanciaXml
          | MilitanciaXml[]
          | undefined
      );
      if (militancias.length > 0) {
        partido = militancias[militancias.length - 1].Partido ?? null;
      }

      items.push({
        id: parseInt(d.DIPID),
        nombre: d.Nombre ?? null,
        apellido_paterno: d.Apellido_Paterno ?? null,
        apellido_materno: d.Apellido_Materno ?? null,
        partido,
        distrito: null,
        url_foto: `http://www.camara.cl/img.aspx?pId=${d.DIPID}&pT=1`,
        updated_at: now(),
      });
    } catch (error) {
      log.error(`Error procesando diputado ${d.DIPID}: ${error}`);
    }
  }

  // 3. Upload
  if (items.length > 0) {
    const count = await batchUpsert(supabase, 'diputados', items, {
      onConflict: 'id',
    });
    log.success(`Guardados ${count} diputados.`);
  }

  log.success('--- ETL Cámara de Diputados Finalizado ---');
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runDiputados().catch(console.error);
}
