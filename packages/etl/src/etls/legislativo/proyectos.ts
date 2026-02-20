/**
 * ETL Proyectos de Ley - Tramitación de Boletines
 *
 * Fuente: tramitacion.senado.cl
 * API: tramitacion.php?boletin={num} → XML con detalle del proyecto
 *
 * Tabla destino: proyectos_ley (upsert, conflict='boletin')
 *
 * Flujo:
 * 1. Obtiene lista de boletines existentes en DB (descubiertos por discovery.ts)
 * 2. Para cada boletín, consulta detalle de tramitación
 * 3. Actualiza/inserta datos en proyectos_ley
 *
 * Migrado de: scripts/etl_proyectos.py
 */

import { getSupabaseLegislativo } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import {
  fetchText,
  sleep,
  parseXml,
  ensureArray,
  batchUpsert,
  parseDateDMY,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('Proyectos');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface ProyectoDescripcion {
  boletin?: string;
  titulo?: string;
  fecha_ingreso?: string;
  iniciativa?: string;
  camara_origen?: string;
  urgencia_actual?: string;
  etapa?: string;
  link_mensaje_mocion?: string;
}

interface ProyectoXml {
  descripcion?: ProyectoDescripcion;
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runProyectos(): Promise<void> {
  log.info('--- Iniciando ETL Proyectos de Ley (Boletines) ---');

  const supabase = getSupabaseLegislativo();

  // 1. Obtener boletines existentes en DB
  let boletines: string[] = [];
  try {
    const { data, error } = await supabase
      .from('proyectos_ley')
      .select('boletin');

    if (error) throw error;
    boletines = (data ?? []).map(
      (item: { boletin: string }) => item.boletin
    );
  } catch (error) {
    log.error(`Error obteniendo boletines de DB: ${error}`);
  }

  // Boletines de prueba si la DB está vacía
  if (boletines.length === 0) {
    boletines = ['8575-07', '16197-07'];
  }

  log.info(`Procesando ${boletines.length} boletines...`);

  let totalUpdated = 0;

  for (const boletinId of boletines) {
    // La API funciona sin el dígito verificador (parte después del guión)
    const cleanId = boletinId.split('-')[0];
    const url = `https://tramitacion.senado.cl/wspublico/tramitacion.php?boletin=${cleanId}`;

    const xml = await fetchText(url);
    if (!xml) {
      await sleep(500);
      continue;
    }

    try {
      const data = parseXml<Record<string, unknown>>(xml);
      const proyectosRaw = ensureArray(
        (data['proyectos'] as Record<string, unknown>)?.['proyecto'] as
          | ProyectoXml
          | ProyectoXml[]
      );

      const items: Record<string, unknown>[] = [];

      for (const p of proyectosRaw) {
        const desc = p.descripcion;
        if (!desc?.boletin) continue;

        const fechaIngreso = parseDateDMY(desc.fecha_ingreso);

        items.push({
          boletin: desc.boletin,
          titulo: desc.titulo ?? null,
          fecha_ingreso: fechaIngreso,
          iniciativa: desc.iniciativa ?? null,
          camara_origen: desc.camara_origen ?? null,
          urgencia_actual: desc.urgencia_actual ?? null,
          etapa: desc.etapa ?? null,
          link_tramitacion: desc.link_mensaje_mocion ?? null,
          updated_at: now(),
        });
      }

      if (items.length > 0) {
        const count = await batchUpsert(supabase, 'proyectos_ley', items, {
          onConflict: 'boletin',
        });
        totalUpdated += count;
      }
    } catch (error) {
      log.error(`Error procesando boletín ${boletinId}: ${error}`);
    }

    await sleep(500); // Rate limit
  }

  log.success(
    `--- ETL Proyectos Finalizado. ${totalUpdated} registros actualizados. ---`
  );
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runProyectos().catch(console.error);
}
