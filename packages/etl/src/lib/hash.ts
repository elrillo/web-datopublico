/**
 * MD5 Deterministic ID Generation para votaciones del Senado
 *
 * CRÍTICO: Esta función DEBE producir resultados idénticos a la versión Python:
 *
 * Python original:
 *   h = hashlib.md5(raw_str.encode('utf-8')).hexdigest()
 *   return 100000000 + (int(h, 16) % 900000000)
 *
 * Rango: 100,000,000 - 999,999,999
 * Propósito: Evitar colisión con IDs de Cámara de Diputados (~20k-40k)
 */

import { createHash } from 'node:crypto';

/**
 * Genera un ID entero determinista para votaciones del Senado.
 *
 * @param boletin - Número de boletín (ej: "8575-07")
 * @param fecha - Fecha en formato DD/MM/YYYY (como viene de la API)
 * @param tema - Tema de la votación (se trunca a 50 chars)
 * @returns Integer en rango [100000000, 999999999]
 */
export function generateVotacionId(
  boletin: string,
  fecha: string,
  tema: string
): number {
  // Truncar tema a 50 caracteres (igual que Python: tema[:50])
  const truncatedTema = tema.substring(0, 50);
  const rawStr = `${boletin}-${fecha}-${truncatedTema}`;

  // MD5 hash → hex string
  const hexDigest = createHash('md5').update(rawStr, 'utf-8').digest('hex');

  // Convertir hex a BigInt y aplicar módulo
  // Python: int(h, 16) % 900000000
  const bigIntValue = BigInt(`0x${hexDigest}`);
  const modResult = Number(bigIntValue % 900_000_000n);

  return 100_000_000 + modResult;
}
