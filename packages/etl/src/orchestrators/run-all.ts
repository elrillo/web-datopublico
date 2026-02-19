/**
 * Orquestador: ETLs Legislativos
 *
 * Ejecuta en secuencia con delays de 10s entre cada ETL:
 * 1. discovery → 2. proyectos → 3. diputados → 4. senado → 5. historical-details → 6. senado-details
 *
 * A diferencia de Python (subprocess.run), importa funciones directamente.
 * Captura errores por ETL sin detener la cadena.
 *
 * Migrado de: scripts/run_all_etls.py
 */

import { validateEnv } from '../config/env.js';
import { createLogger, sleep } from '../lib/index.js';
import { runDiscovery } from '../etls/legislativo/discovery.js';
// Los demás ETLs se importarán cuando se migren:
// import { runProyectos } from '../etls/legislativo/proyectos.js';
// import { runDiputados } from '../etls/legislativo/diputados.js';
// import { runSenado } from '../etls/legislativo/senado.js';
// import { runHistoricalDetails } from '../etls/legislativo/historical-details.js';
// import { runSenadoDetails } from '../etls/legislativo/senado-details.js';

const log = createLogger('Orchestrator');
const DELAY_BETWEEN_ETLS = 10_000; // 10 segundos

interface EtlStep {
  name: string;
  fn: () => Promise<void>;
}

const steps: EtlStep[] = [
  { name: 'Discovery (Boletines)', fn: runDiscovery },
  // Fase 2: descomentar cuando se migren
  // { name: 'Proyectos de Ley', fn: runProyectos },
  // { name: 'Diputados', fn: runDiputados },
  // { name: 'Senadores', fn: runSenado },
  // { name: 'Votaciones Cámara (Detalle)', fn: runHistoricalDetails },
  // { name: 'Votaciones Senado (Detalle)', fn: runSenadoDetails },
];

async function main(): Promise<void> {
  validateEnv(['LEGISLATIVO_URL', 'LEGISLATIVO_SERVICE_ROLE_KEY']);

  log.info(`=== Iniciando Pipeline Legislativo (${steps.length} ETLs) ===`);
  const startTime = Date.now();

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    log.info(`\n[${i + 1}/${steps.length}] Ejecutando: ${step.name}...`);

    try {
      await step.fn();
      completed++;
      log.success(`[${i + 1}/${steps.length}] ${step.name} completado.`);
    } catch (error) {
      failed++;
      log.error(`[${i + 1}/${steps.length}] ${step.name} falló: ${error}`);
    }

    // Delay entre ETLs (excepto el último)
    if (i < steps.length - 1) {
      log.info(`Esperando ${DELAY_BETWEEN_ETLS / 1000}s antes del siguiente ETL...`);
      await sleep(DELAY_BETWEEN_ETLS);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`\n=== Pipeline Legislativo Finalizado ===`);
  log.info(`  Completados: ${completed}/${steps.length}`);
  log.info(`  Fallidos: ${failed}/${steps.length}`);
  log.info(`  Tiempo total: ${elapsed}s`);
}

main().catch(console.error);
