/**
 * ETL Votaciones Detalle - Cámara de Diputados
 *
 * Fuente: opendata.camara.cl
 * APIs:
 *   - getVotaciones_Boletin?prmBoletin={boletin} → votaciones por boletín
 *   - getVotacion_Detalle?prmVotacionID={id} → votos individuales
 *
 * Tablas destino:
 *   - votaciones_sala (upsert, conflict='id')
 *   - fact_votaciones_detalle (insert)
 *
 * Migrado de: scripts/etl_historical_details.py (load_votaciones_detalle)
 */

import { getSupabaseLegislativo } from '../../config/supabase.js';
import { validateEnv } from '../../config/env.js';
import {
  fetchText,
  sleep,
  parseXml,
  ensureArray,
  batchUpsert,
  batchInsert,
  parseDateISO,
  now,
  createLogger,
} from '../../lib/index.js';

const log = createLogger('HistoricalDetails');

// ─── Tipos ───────────────────────────────────────────────────────────────

interface VotacionXml {
  ID?: string;
  Fecha?: string;
  Tipo?: { Nombre?: string };
  Resultado?: string | { '#text'?: string };
  Quorum?: { Nombre?: string };
}

interface VotoXml {
  Diputado?: {
    DIPID?: string;
    Nombre?: string;
    Apellido_Paterno?: string;
  };
  OpcionVoto?: string | { Nombre?: string };
}

// ─── ETL Principal ──────────────────────────────────────────────────────

export async function runHistoricalDetails(): Promise<void> {
  log.info('--- Iniciando ETL Votaciones Detalle (Cámara) ---');

  const supabase = getSupabaseLegislativo();

  // 1. Obtener boletines del periodo actual (>= 2022-03-11)
  log.info('Obteniendo boletines del periodo actual (>= 2022-03-11)...');
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

  log.info(`Procesando detalles para ${boletines.length} boletines...`);

  let totalVotosGuardados = 0;

  for (const boletinId of boletines) {
    // Obtener votaciones del boletín
    const url = `https://opendata.camara.cl/wscamaradiputados.asmx/getVotaciones_Boletin?prmBoletin=${boletinId}`;
    const xml = await fetchText(url);
    if (!xml) {
      await sleep(200);
      continue;
    }

    try {
      const data = parseXml<Record<string, unknown>>(xml);
      const votaciones = ensureArray(
        (data['Votaciones'] as Record<string, unknown>)?.['Votacion'] as
          | VotacionXml
          | VotacionXml[]
      );

      if (votaciones.length === 0) {
        await sleep(200);
        continue;
      }

      for (const v of votaciones) {
        const vid = v.ID;
        if (!vid) continue;

        try {
          log.info(`  Procesando Votación ${vid}...`);

          // Parse fecha ISO
          const fecha = parseDateISO(v.Fecha);

          // Resultado puede ser string o dict con #text
          let resultado: string | null = null;
          if (typeof v.Resultado === 'string') {
            resultado = v.Resultado;
          } else if (
            typeof v.Resultado === 'object' &&
            v.Resultado !== null
          ) {
            resultado =
              (v.Resultado as Record<string, string>)['#text'] ?? null;
          }

          // 1. Upsert header votación
          const { error: upsertError } = await supabase
            .from('votaciones_sala')
            .upsert(
              {
                id: parseInt(vid),
                boletin: boletinId,
                fecha,
                materia: v.Tipo?.Nombre
                  ? String(v.Tipo.Nombre)
                  : null,
                resultado: resultado ? String(resultado) : null,
                quorum: v.Quorum?.Nombre
                  ? String(v.Quorum.Nombre)
                  : null,
                updated_at: now(),
              },
              { onConflict: 'id' }
            );

          if (upsertError) {
            log.error(`Error header votacion ${vid}: ${upsertError.message}`);
            continue;
          }

          // 2. Obtener detalle de votos individuales
          const detUrl = `https://opendata.camara.cl/wscamaradiputados.asmx/getVotacion_Detalle?prmVotacionID=${vid}`;
          const detXml = await fetchText(detUrl);

          if (detXml) {
            const detData = parseXml<Record<string, unknown>>(detXml);
            const votos = ensureArray(
              (
                (detData['Votacion'] as Record<string, unknown>)?.[
                  'Votos'
                ] as Record<string, unknown>
              )?.['Voto'] as VotoXml | VotoXml[]
            );

            const votosDb: Record<string, unknown>[] = [];
            for (const voto of votos) {
              const dip = voto.Diputado;
              if (!dip?.DIPID) continue;

              // OpcionVoto puede ser string o dict con Nombre
              let opcion: string | null = null;
              if (typeof voto.OpcionVoto === 'string') {
                opcion = voto.OpcionVoto;
              } else if (
                typeof voto.OpcionVoto === 'object' &&
                voto.OpcionVoto !== null
              ) {
                opcion =
                  (voto.OpcionVoto as Record<string, string>).Nombre ?? null;
              }

              votosDb.push({
                votacion_id: parseInt(vid),
                parlamentario_id: parseInt(dip.DIPID),
                camara: 'Diputados',
                nombre_parlamentario: `${dip.Nombre ?? ''} ${dip.Apellido_Paterno ?? ''}`.trim(),
                opcion_voto: opcion ? String(opcion) : null,
              });
            }

            if (votosDb.length > 0) {
              const count = await batchInsert(
                supabase,
                'fact_votaciones_detalle',
                votosDb
              );
              totalVotosGuardados += count;
              log.info(`    Guardados ${count} votos detalle.`);
            }
          }

          await sleep(200);
        } catch (error) {
          log.error(`Error procesando votación ${vid}: ${error}`);
        }
      }
    } catch (error) {
      log.error(`Error procesando boletín ${boletinId}: ${error}`);
    }

    await sleep(200);
  }

  log.success(
    `--- ETL Votaciones Cámara Finalizado. Total votos: ${totalVotosGuardados} ---`
  );
}

// ─── Entry point ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);
  runHistoricalDetails().catch(console.error);
}
