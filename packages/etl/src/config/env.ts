/**
 * Carga y validación de variables de entorno
 * Soporta tanto .env local como GitHub Actions secrets
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cargar .env desde la raíz del proyecto (equivalente al Python: os.path.dirname x2)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '..', '..', '.env');
config({ path: envPath });

/** Variables de entorno del proyecto Supabase Legislativo */
export const LEGISLATIVO_URL = process.env.LEGISLATIVO_URL ?? '';
export const LEGISLATIVO_SERVICE_ROLE_KEY = process.env.LEGISLATIVO_SERVICE_ROLE_KEY ?? '';

/** Variables de entorno del proyecto Supabase Primary (MercadoPublico) */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** API Key de MercadoPublico */
export const MERCADOPUBLICO_TICKET = process.env.MERCADOPUBLICO_TICKET ?? '';

/**
 * Valida que las variables requeridas estén configuradas
 */
export function validateEnv(required: string[]): void {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Ensure they are set in .env file or as GitHub Actions secrets.`
    );
  }
}
