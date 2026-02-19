/**
 * @datopublico/etl - ETL Pipeline para DatoPublico.cl
 *
 * Uso:
 *   npm run etl:legislativo    → Ejecuta pipeline legislativo completo
 *   npm run etl:mercadopublico → Ejecuta pipeline mercado público
 *   npm run etl:discovery      → Ejecuta solo discovery de boletines
 */

export { runDiscovery } from './etls/legislativo/discovery.js';
