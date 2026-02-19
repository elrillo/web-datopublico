/**
 * Clientes Supabase para ETLs
 *
 * Usa SERVICE_ROLE_KEY (no anon key) para bypass de RLS.
 * Dos proyectos separados:
 * - Primary: datos_mercadopublico, licitaciones, proveedores, organismos, noticias
 * - Legislativo: proyectos_ley, senadores, diputados, sesiones, votaciones_sala, fact_*
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LEGISLATIVO_URL,
  LEGISLATIVO_SERVICE_ROLE_KEY,
} from './env.js';

let _primary: SupabaseClient | null = null;
let _legislativo: SupabaseClient | null = null;

/**
 * Cliente Supabase para el proyecto Primary (MercadoPublico, Noticias, Auth)
 */
export function getSupabasePrimary(): SupabaseClient {
  if (!_primary) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    _primary = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _primary;
}

/**
 * Cliente Supabase para el proyecto Legislativo (Congreso Nacional)
 */
export function getSupabaseLegislativo(): SupabaseClient {
  if (!_legislativo) {
    if (!LEGISLATIVO_URL || !LEGISLATIVO_SERVICE_ROLE_KEY) {
      throw new Error('LEGISLATIVO_URL and LEGISLATIVO_SERVICE_ROLE_KEY must be set');
    }
    _legislativo = createClient(LEGISLATIVO_URL, LEGISLATIVO_SERVICE_ROLE_KEY);
  }
  return _legislativo;
}
