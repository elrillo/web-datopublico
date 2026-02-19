/**
 * ETL Discovery - Descubrimiento de Boletines desde Sesiones de la Cámara
 *
 * Fuente: opendata.camara.cl
 * APIs:
 *   - getLegislaturas → lista de legislaturas
 *   - getSesiones → sesiones por legislatura
 *   - getSesionBoletinXML → boletines de una sesión
 *
 * Tablas destino:
 *   - sesiones (upsert, conflict='id')
 *   - proyectos_ley (upsert, conflict='boletin', ignoreDuplicates)
 *
 * Migrado de: scripts/etl_discovery.py
 */

import { getSupabaseLegislativo } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import {
  fetchText,
  sleep,
  parseXml,
  ensureArray,
  batchUpsert,
  parseDateISO,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('Discovery');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface Legislatura {
  ID: string;
  Nombre?: string;
}

interface Sesion {
  ID: string;
  Numero?: string;
  Fecha?: string;
  Tipo?: string;
}

// ─── Funciones auxiliares ────────────────────────────────────────────────

/**
 * Búsqueda recursiva en el árbol XML para encontrar boletines.
 * Replica la función recursive_search() de Python.
 *
 * Busca claves 'Proyecto' o 'PROYECTO_LEY', y dentro extrae
 * '@_Boletin', 'Boletin', o '@_BOLETIN'.
 */
function extractBoletinesRecursive(
  node: unknown,
  boletines: Set<string>
): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'Proyecto' || key === 'PROYECTO_LEY') {
        // Puede ser un objeto (1 proyecto) o array (múltiples)
        const items = ensureArray(value as Record<string, unknown>);
        for (const item of items) {
          if (typeof item === 'object' && item !== null) {
            const record = item as Record<string, unknown>;
            const boletin =
              record['@_Boletin'] ??
              record['Boletin'] ??
              record['@_BOLETIN'];
            if (boletin && typeof boletin === 'string') {
              boletines.add(boletin);
            }
          }
        }
      }

      // Seguir buscando recursivamente
      extractBoletinesRecursive(value, boletines);
    }
  } else if (Array.isArray(node)) {
    for (const item of node) {
      extractBoletinesRecursive(item, boletines);
    }
  }
}

/**
 * Extrae boletines de una sesión específica via XML.
 * Replica: extract_boletines_from_sesion() de Python.
 */
async function extractBoletinesFromSesion(sesionId: string): Promise<string[]> {
  const url = `https://opendata.camara.cl/wscamaradiputados.asmx/getSesionBoletinXML?prmSesionID=${sesionId}`;
  const xml = await fetchText(url);
  if (!xml) return [];

  try {
    const data = parseXml<Record<string, unknown>>(xml);
    const sesionNode =
      (data['BOLETINXML'] as Record<string, unknown>)?.['SESION'] ?? {};

    const boletines = new Set<string>();
    extractBoletinesRecursive(sesionNode, boletines);
    return Array.from(boletines);
  } catch (error) {
    log.error(`Error parsing sesion ${sesionId}: ${error}`);
    return [];
  }
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runDiscovery(): Promise<void> {
  log.info('--- Iniciando Descubrimiento de Boletines ---');

  const supabase = getSupabaseLegislativo();

  // 1. Obtener Legislaturas
  const legUrl =
    'https://opendata.camara.cl/wscamaradiputados.asmx/getLegislaturas';
  const legXml = await fetchText(legUrl);
  if (!legXml) {
    log.error('No se pudo obtener legislaturas. Abortando.');
    return;
  }

  const legData = parseXml<Record<string, unknown>>(legXml);
  const legislaturas = ensureArray(
    (legData['Legislaturas'] as Record<string, unknown>)?.['Legislatura'] as
      | Legislatura
      | Legislatura[]
  );

  // Ordenar por ID descendente (más reciente primero)
  legislaturas.sort((a, b) => parseInt(b.ID) - parseInt(a.ID));

  let totalBoletinesFound = 0;

  // Procesar las últimas 5 legislaturas
  for (const leg of legislaturas.slice(0, 5)) {
    const legId = leg.ID;
    log.info(`Procesando Legislatura ${legId}...`);

    // 2. Obtener Sesiones de la Legislatura
    const sesUrl = `https://opendata.camara.cl/wscamaradiputados.asmx/getSesiones?prmLegislaturaID=${legId}`;
    const sesXml = await fetchText(sesUrl);
    if (!sesXml) {
      log.warn(`No se pudieron obtener sesiones para legislatura ${legId}`);
      continue;
    }

    const sesData = parseXml<Record<string, unknown>>(sesXml);
    const sesiones = ensureArray(
      (sesData['Sesiones'] as Record<string, unknown>)?.['Sesion'] as
        | Sesion
        | Sesion[]
    );

    // Ordenar descendente por ID
    sesiones.sort((a, b) => parseInt(b.ID) - parseInt(a.ID));

    log.info(
      `  Encontradas ${sesiones.length} sesiones. Procesando las últimas 20...`
    );

    // Procesar top 20 sesiones
    const sesionesToProcess = sesiones.slice(0, 20);

    // 3. Preparar datos para tabla 'sesiones'
    const sesionesDbItems: Record<string, unknown>[] = [];
    for (const s of sesionesToProcess) {
      try {
        const fecha = parseDateISO(s.Fecha);

        sesionesDbItems.push({
          id: `DIP-${s.ID}`,
          camara: 'Diputados',
          numero: parseInt(s.Numero ?? '0'),
          legislatura: parseInt(legId),
          fecha,
          tipo: s.Tipo,
          updated_at: now(),
        });
      } catch (error) {
        log.error(`Error parseando sesión: ${error}`);
      }
    }

    // Guardar sesiones en lote
    if (sesionesDbItems.length > 0) {
      const count = await batchUpsert(supabase, 'sesiones', sesionesDbItems, {
        onConflict: 'id',
      });
      log.info(`    Guardadas ${count} sesiones en DB.`);
    }

    // 4. Buscar boletines en cada sesión
    for (const ses of sesionesToProcess) {
      const boletines = await extractBoletinesFromSesion(ses.ID);

      if (boletines.length > 0) {
        log.info(
          `    Sesión ${ses.ID}: Encontrados ${boletines.length} boletines.`
        );

        const items = boletines.map((b) => ({ boletin: b }));
        await batchUpsert(supabase, 'proyectos_ley', items, {
          onConflict: 'boletin',
          ignoreDuplicates: true,
        });

        totalBoletinesFound += boletines.length;
      }

      await sleep(500); // Rate limit: 0.5s entre sesiones
    }
  }

  log.success(
    `--- Descubrimiento Finalizado. Total nuevos boletines potenciales: ${totalBoletinesFound} ---`
  );
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runDiscovery().catch(console.error);
}
