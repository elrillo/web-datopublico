/**
 * ETL Licitaciones - MercadoPublico
 *
 * Fuente: api.mercadopublico.cl
 * API: /servicios/v1/publico/licitaciones.json?fecha={DDMMYYYY}&ticket={key}
 *
 * Tabla destino: licitaciones (upsert, conflict='codigo')
 *
 * Migrado de: scripts/etl_licitaciones.py
 */

import { getSupabasePrimary } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import { MERCADOPUBLICO_TICKET } from '../../config/env.js';
import {
  fetchWithRetry,
  batchUpsert,
  parseDateISO,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('Licitaciones');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface LicitacionApi {
  CodigoExterno?: string;
  CodigoExternal?: string;
  Nombre?: string;
  Estado?: string;
  Comprador?: {
    NombreOrganismo?: string;
    CodigoOrganismo?: string;
  };
  FechaCreacion?: string;
  FechaCierre?: string;
  Moneda?: string;
  MontoEstimado?: number;
  Tipo?: string;
}

interface LicitacionesResponse {
  Cantidad?: number;
  Listado?: LicitacionApi[];
}

// ─── Funciones ──────────────────────────────────────────────────────────

function getYesterdayDDMMYYYY(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function processLicitaciones(
  data: LicitacionesResponse
): Record<string, unknown>[] {
  if (!data?.Listado) {
    log.warn('No se encontraron datos en Listado.');
    return [];
  }

  const items: Record<string, unknown>[] = [];

  for (const item of data.Listado) {
    try {
      // CodigoExterno con fallback a CodigoExternal
      const codigo = item.CodigoExterno ?? item.CodigoExternal;
      if (!codigo) continue;

      const fechaPub = parseDateISO(item.FechaCreacion);
      const fechaCierre = parseDateISO(item.FechaCierre);

      items.push({
        codigo,
        nombre: item.Nombre ?? null,
        estado: item.Estado ?? null,
        comprador_nombre: item.Comprador?.NombreOrganismo ?? null,
        comprador_codigo: item.Comprador?.CodigoOrganismo ?? null,
        fecha_publicacion: fechaPub,
        fecha_cierre: fechaCierre,
        moneda: item.Moneda ?? null,
        monto_estimado: item.MontoEstimado ?? null,
        tipo: item.Tipo ?? null,
      });
    } catch (error) {
      log.error(
        `Error procesando licitación ${item.CodigoExterno ?? item.CodigoExternal ?? 'DESCONOCIDO'}: ${error}`
      );
    }
  }

  return items;
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runLicitaciones(): Promise<void> {
  log.info('--- Iniciando ETL Licitaciones ---');

  const supabase = getSupabasePrimary();
  const dateStr = getYesterdayDDMMYYYY();

  log.info(`Consultando licitaciones para fecha: ${dateStr}...`);

  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${dateStr}&ticket=${MERCADOPUBLICO_TICKET}`;

  let rawData: LicitacionesResponse;
  try {
    const text = await fetchWithRetry(url, { timeout: 60_000 });
    rawData = JSON.parse(text) as LicitacionesResponse;
  } catch (error) {
    log.error(`No se obtuvieron datos: ${error}`);
    return;
  }

  // Procesar
  const cleanData = processLicitaciones(rawData);
  if (cleanData.length === 0) {
    log.warn('No hay licitaciones para procesar.');
    return;
  }

  // Upload
  const count = await batchUpsert(supabase, 'licitaciones', cleanData, {
    onConflict: 'codigo',
  });
  log.success(`Procesadas ${count} licitaciones.`);

  log.success('--- ETL Licitaciones Finalizado ---');
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MERCADOPUBLICO_TICKET',
  ]);
  runLicitaciones().catch(console.error);
}
