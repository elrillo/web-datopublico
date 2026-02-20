/**
 * ETL Órdenes de Compra - MercadoPublico
 *
 * Fuente: api.mercadopublico.cl
 * API: /servicios/v1/publico/ordenesdecompra.json?fecha={DDMMYYYY}&ticket={key}
 *
 * Tablas destino:
 *   - datos_mercadopublico (upsert, conflict='codigo')
 *   - proveedores (upsert, conflict='rut')
 *
 * Migrado de: scripts/etl_mercadopublico.py
 */

import { getSupabasePrimary } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import { MERCADOPUBLICO_TICKET } from '../../config/env.js';
import {
  fetchWithRetry,
  batchUpsert,
  parseDateISO,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('Ordenes');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface OrdenApi {
  Codigo?: string;
  Nombre?: string;
  Estado?: string;
  MontoTotal?: number;
  TipoMoneda?: string;
  FechaCreacion?: string;
  Comprador?: {
    NombreOrganismo?: string;
    Sector?: string;
  };
  Proveedor?: {
    RutSucursal?: string;
    Nombre?: string;
  };
}

interface OrdenesResponse {
  Cantidad?: number;
  Listado?: OrdenApi[];
}

// ─── Funciones ──────────────────────────────────────────────────────────

/**
 * Genera fecha DDMMYYYY para la API de MercadoPublico.
 * Por defecto: ayer (para asegurar datos completos del día).
 */
function getYesterdayDDMMYYYY(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function processOrdenes(data: OrdenesResponse): Record<string, unknown>[] {
  if (!data?.Listado) {
    log.warn('No se encontraron datos en Listado.');
    return [];
  }

  const items: Record<string, unknown>[] = [];

  for (const item of data.Listado) {
    try {
      const fecha = parseDateISO(item.FechaCreacion) ?? now();

      items.push({
        codigo: item.Codigo,
        fecha,
        organismo: item.Comprador?.NombreOrganismo ?? null,
        monto: item.MontoTotal ?? null,
        moneda: item.TipoMoneda ?? null,
        estado: item.Estado ?? null,
        tipo: 'Orden de Compra',
        descripcion: item.Nombre ?? null,
        sector: item.Comprador?.Sector ?? 'Sin Clasificar',
        proveedor_rut: item.Proveedor?.RutSucursal ?? null,
        proveedor_nombre: item.Proveedor?.Nombre ?? null,
      });
    } catch (error) {
      log.error(
        `Error procesando orden ${item.Codigo ?? 'DESCONOCIDO'}: ${error}`
      );
    }
  }

  return items;
}

function extractProveedores(
  items: Record<string, unknown>[]
): Record<string, unknown>[] {
  const proveedores = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    const rut = item.proveedor_rut as string | null;
    const nombre = item.proveedor_nombre as string | null;
    if (rut && !proveedores.has(rut)) {
      proveedores.set(rut, { rut, nombre });
    }
  }

  return Array.from(proveedores.values());
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runOrdenes(): Promise<void> {
  log.info('--- Iniciando ETL MercadoPublico (Órdenes de Compra) ---');

  const supabase = getSupabasePrimary();
  const dateStr = getYesterdayDDMMYYYY();

  log.info(`Consultando órdenes para fecha: ${dateStr}...`);

  const url = `https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json?fecha=${dateStr}&ticket=${MERCADOPUBLICO_TICKET}`;

  let rawData: OrdenesResponse;
  try {
    const text = await fetchWithRetry(url, { timeout: 60_000 });
    rawData = JSON.parse(text) as OrdenesResponse;
  } catch (error) {
    log.error(`No se obtuvieron datos: ${error}`);
    return;
  }

  // Procesar órdenes
  const cleanData = processOrdenes(rawData);
  if (cleanData.length === 0) {
    log.warn('No hay datos para procesar.');
    return;
  }

  // Upload órdenes
  const count = await batchUpsert(supabase, 'datos_mercadopublico', cleanData, {
    onConflict: 'codigo',
  });
  log.success(`Procesados ${count} registros en datos_mercadopublico.`);

  // Upload proveedores únicos
  const proveedores = extractProveedores(cleanData);
  if (proveedores.length > 0) {
    log.info(
      `Identificados ${proveedores.length} proveedores únicos. Actualizando...`
    );
    const pCount = await batchUpsert(supabase, 'proveedores', proveedores, {
      onConflict: 'rut',
      batchSize: 500,
    });
    log.success(`Actualizados ${pCount} proveedores.`);
  }

  log.success('--- ETL Órdenes de Compra Finalizado ---');
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MERCADOPUBLICO_TICKET',
  ]);
  runOrdenes().catch(console.error);
}
