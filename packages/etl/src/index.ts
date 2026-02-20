/**
 * @datopublico/etl - ETL Pipeline para DatoPublico.cl
 *
 * Uso:
 *   npm run etl:legislativo    → Ejecuta pipeline legislativo completo
 *   npm run etl:mercadopublico → Ejecuta pipeline mercado público
 *   npm run etl:discovery      → Ejecuta solo discovery de boletines
 */

// Legislativo
export { runDiscovery } from './etls/legislativo/discovery.js';
export { runDiputados } from './etls/legislativo/diputados.js';
export { runSenado } from './etls/legislativo/senado.js';
export { runProyectos } from './etls/legislativo/proyectos.js';
export { runHistoricalDetails } from './etls/legislativo/historical-details.js';
export { runSenadoDetails } from './etls/legislativo/senado-details.js';

// MercadoPublico
export { runOrdenes } from './etls/mercadopublico/ordenes.js';
export { runLicitaciones } from './etls/mercadopublico/licitaciones.js';
