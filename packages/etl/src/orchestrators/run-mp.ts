/**
 * Orquestador: ETLs Mercado Público
 *
 * Ejecuta en secuencia:
 * 1. Órdenes de Compra → 2. Licitaciones
 *
 * Migrado de: scripts/run_mp_etls.py
 */

import { validateEnv } from '../config/env.js';
import { createLogger, sleep } from '../lib/index.js';
// Fase 2: descomentar cuando se migren
// import { runOrdenes } from '../etls/mercadopublico/ordenes.js';
// import { runLicitaciones } from '../etls/mercadopublico/licitaciones.js';

const log = createLogger('Orchestrator-MP');
const DELAY_BETWEEN_ETLS = 10_000;

interface EtlStep {
  name: string;
  fn: () => Promise<void>;
}

const steps: EtlStep[] = [
  // Fase 2: descomentar cuando se migren
  // { name: 'Órdenes de Compra', fn: runOrdenes },
  // { name: 'Licitaciones', fn: runLicitaciones },
];

async function main(): Promise<void> {
  validateEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MERCADOPUBLICO_TICKET']);

  log.info(`=== Iniciando Pipeline Mercado Público (${steps.length} ETLs) ===`);
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

    if (i < steps.length - 1) {
      log.info(`Esperando ${DELAY_BETWEEN_ETLS / 1000}s...`);
      await sleep(DELAY_BETWEEN_ETLS);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`\n=== Pipeline MercadoPublico Finalizado ===`);
  log.info(`  Completados: ${completed}/${steps.length}`);
  log.info(`  Fallidos: ${failed}/${steps.length}`);
  log.info(`  Tiempo total: ${elapsed}s`);
}

main().catch(console.error);
