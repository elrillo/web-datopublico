/**
 * Parseo de fechas en múltiples formatos usados por APIs chilenas
 *
 * Formatos soportados:
 * - DD/MM/YYYY (Senado: "11/03/2022")
 * - YYYY-MM-DDTHH:MM:SS (Cámara de Diputados ISO)
 * - DDMMYYYY (MercadoPublico: "11032022")
 */

/**
 * Parsea fecha DD/MM/YYYY → YYYY-MM-DD (ISO date)
 * Usado por: etl_proyectos.py, etl_senado_details.py
 */
export function parseDateDMY(date: string | null | undefined): string | null {
  if (!date) return null;
  const parts = date.split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  if (!day || !month || !year) return null;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parsea fecha YYYY-MM-DDTHH:MM:SS → ISO string
 * Usado por: etl_discovery.py (Cámara de Diputados)
 */
export function parseDateISO(date: string | null | undefined): string | null {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Parsea fecha DDMMYYYY → YYYY-MM-DD (ISO date)
 * Usado por: etl_mercadopublico.py
 */
export function parseDateCompact(date: string | null | undefined): string | null {
  if (!date || date.length !== 8) return null;

  const day = date.substring(0, 2);
  const month = date.substring(2, 4);
  const year = date.substring(4, 8);

  return `${year}-${month}-${day}`;
}

/**
 * Parsea DD/MM/YYYY → ISO datetime string (para timestamps)
 * Replica: datetime.strptime(fecha_str, "%d/%m/%Y").isoformat()
 */
export function parseDateDMYToISO(date: string | null | undefined): string | null {
  if (!date) return null;
  const parts = date.split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  if (!day || !month || !year) return null;

  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(d.getTime())) return null;

  return d.toISOString();
}

/** Retorna timestamp ISO actual */
export function now(): string {
  return new Date().toISOString();
}
