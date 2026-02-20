/**
 * ETL Votaciones Detalle - Senado
 *
 * Fuente: tramitacion.senado.cl
 * API: votaciones.php?boletin={num} → XML con votaciones y votos
 *
 * Tablas destino:
 *   - votaciones_sala (upsert, conflict='id')
 *   - fact_votaciones_detalle (insert)
 *
 * NOTA IMPORTANTE: Los IDs de votaciones del Senado se generan con MD5
 * determinista para evitar colisión con IDs de la Cámara (~20k-40k).
 * Rango Senado: [100M, 999M]. La función generateVotacionId() DEBE
 * producir resultados idénticos a la versión Python.
 *
 * Migrado de: scripts/etl_senado_details.py
 */

import { getSupabaseLegislativo } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import {
  fetchText,
  sleep,
  parseXml,
  ensureArray,
  batchInsert,
  parseDateDMYToISO,
  generateVotacionId,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('SenadoDetails');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface VotacionSenadoXml {
  FECHA?: string;
  TEMA?: string;
  SI?: string;
  NO?: string;
  ABSTENCION?: string;
  QUORUM?: string;
  TIPOVOTACION?: string;
  DETALLE_VOTACION?: {
    VOTO?: VotoSenadoXml | VotoSenadoXml[];
  };
}

interface VotoSenadoXml {
  PARLAMENTARIO?: string;
  SELECCION?: string;
}

interface SenadorDb {
  id: number;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
}

type SenadoresMap = Record<string, SenadorDb[]>;

// ─── Funciones Auxiliares ───────────────────────────────────────────────

/**
 * Carga mapa de senadores indexado por apellido_paterno (lowercase).
 * Replica: load_senadores_map() de Python.
 */
async function loadSenadoresMap(
  supabase: ReturnType<typeof getSupabaseLegislativo>
): Promise<SenadoresMap> {
  log.info('Cargando mapa de Senadores desde DB...');
  const { data, error } = await supabase
    .from('senadores')
    .select('id, nombre, apellido_paterno, apellido_materno');

  if (error) {
    log.error(`Error cargando senadores: ${error.message}`);
    return {};
  }

  const map: SenadoresMap = {};
  for (const s of data as SenadorDb[]) {
    const key = s.apellido_paterno.toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }

  return map;
}

/**
 * Parsea nombre del formato Senado: "Tuma Z., Eugenio" → { nombre, apellido }
 * Replica: clean_parlamentario_name() de Python.
 */
function cleanParlamentarioName(raw: string): {
  nombre: string;
  apellido: string;
} {
  const parts = raw.split(',');
  if (parts.length === 2) {
    return {
      apellido: parts[0].trim(),
      nombre: parts[1].trim(),
    };
  }
  return { nombre: raw, apellido: '' };
}

/**
 * Busca el ID del senador por apellido paterno con desambiguación por nombre.
 * Replica: find_senador_id() de Python.
 */
function findSenadorId(
  nombre: string,
  apellidoRaw: string,
  map: SenadoresMap
): number | null {
  // "Tuma Z." → "tuma"
  const apellidoClean = apellidoRaw.split(' ')[0].toLowerCase();

  const candidates = map[apellidoClean];
  if (!candidates || candidates.length === 0) return null;

  if (candidates.length === 1) return candidates[0].id;

  // Desempate por nombre
  const nombreLower = nombre.toLowerCase();
  for (const c of candidates) {
    if (
      c.nombre.toLowerCase().includes(nombreLower) ||
      nombreLower.includes(c.nombre.toLowerCase())
    ) {
      return c.id;
    }
  }

  // Fallback al primero
  return candidates[0].id;
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runSenadoDetails(): Promise<void> {
  log.info('--- Iniciando ETL Detalle Votaciones Senado ---');

  const supabase = getSupabaseLegislativo();
  const senadoresMap = await loadSenadoresMap(supabase);

  // 1. Obtener boletines recientes
  log.info('Obteniendo boletines recientes (>= 2022-03-11)...');
  const { data: boletinesData, error } = await supabase
    .from('proyectos_ley')
    .select('boletin')
    .gte('fecha_ingreso', '2022-03-11');

  if (error) {
    log.error(`Error obteniendo boletines: ${error.message}`);
    return;
  }

  const boletines = (boletinesData ?? []).map(
    (b: { boletin: string }) => b.boletin
  );

  log.info(`Procesando ${boletines.length} boletines...`);

  let totalVotosOk = 0;

  for (const boletinRaw of boletines) {
    // La API Senado funciona sin dígito verificador
    const boletinQuery = boletinRaw.includes('-')
      ? boletinRaw.split('-')[0]
      : boletinRaw;

    const url = `https://tramitacion.senado.cl/wspublico/votaciones.php?boletin=${boletinQuery}`;
    const xml = await fetchText(url);
    if (!xml) {
      await sleep(200);
      continue;
    }

    try {
      const data = parseXml<Record<string, unknown>>(xml);
      const votsWrapper = data['votaciones'] as Record<string, unknown>;
      if (!votsWrapper) continue;

      const votaciones = ensureArray(
        votsWrapper['votacion'] as
          | VotacionSenadoXml
          | VotacionSenadoXml[]
      );

      if (votaciones.length === 0) continue;

      log.info(
        `  Boletin ${boletinRaw}: ${votaciones.length} votaciones encontradas.`
      );

      let countVotos = 0;

      for (const v of votaciones) {
        try {
          const fechaStr = v.FECHA ?? '';
          const tema = v.TEMA ?? '';

          // Parse fecha DD/MM/YYYY → ISO
          const fechaIso = parseDateDMYToISO(fechaStr);

          // Generar ID determinista (idéntico a Python)
          const vid = generateVotacionId(
            boletinRaw,
            fechaStr,
            tema.substring(0, 50)
          );

          // Upsert header
          const { error: upsertError } = await supabase
            .from('votaciones_sala')
            .upsert(
              {
                id: vid,
                boletin: boletinRaw,
                fecha: fechaIso,
                materia: tema.substring(0, 500),
                resultado: `Sí: ${v.SI ?? '0'}, No: ${v.NO ?? '0'}, Abs: ${v.ABSTENCION ?? '0'}`,
                quorum: v.QUORUM ?? null,
                tipo_votacion: v.TIPOVOTACION ?? null,
                updated_at: now(),
              },
              { onConflict: 'id' }
            );

          if (upsertError) {
            log.error(
              `Error header votacion senado ${vid}: ${upsertError.message}`
            );
            continue;
          }

          // Detalle votos
          const detalles = ensureArray(
            v.DETALLE_VOTACION?.VOTO as
              | VotoSenadoXml
              | VotoSenadoXml[]
              | undefined
          );

          const votosDb: Record<string, unknown>[] = [];
          for (const d of detalles) {
            const parlRaw = d.PARLAMENTARIO;
            if (!parlRaw) continue;

            const { nombre, apellido } = cleanParlamentarioName(parlRaw);
            const sid = findSenadorId(nombre, apellido, senadoresMap);

            if (sid) {
              votosDb.push({
                votacion_id: vid,
                parlamentario_id: sid,
                camara: 'Senado',
                nombre_parlamentario: parlRaw,
                opcion_voto: d.SELECCION ?? null,
              });
            }
          }

          if (votosDb.length > 0) {
            const count = await batchInsert(
              supabase,
              'fact_votaciones_detalle',
              votosDb
            );
            countVotos += count;
          }
        } catch {
          // Error individual en votación, continuar
        }
      }

      if (countVotos > 0) {
        totalVotosOk += countVotos;
        log.info(`    Guardados ${countVotos} votos de senadores.`);
      }
    } catch (error) {
      log.error(`Error procesando boletín senado ${boletinRaw}: ${error}`);
    }

    await sleep(300);
  }

  log.success(
    `--- ETL Votaciones Senado Finalizado. Total votos: ${totalVotosOk} ---`
  );
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runSenadoDetails().catch(console.error);
}
