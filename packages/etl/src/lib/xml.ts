/**
 * XML Parsing helpers usando fast-xml-parser
 * Reemplaza: xmltodict de Python
 */

import { XMLParser } from 'fast-xml-parser';

/**
 * Parser configurado para replicar el comportamiento de xmltodict:
 * - Preserva atributos XML como @atributo
 * - Maneja namespaces
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * Parsea XML string a objeto JavaScript.
 * Equivalente a xmltodict.parse() de Python.
 */
export function parseXml<T = Record<string, unknown>>(xml: string): T {
  return parser.parse(xml) as T;
}

/**
 * Garantiza que un valor sea un array.
 * En XML, un solo elemento hijo se parsea como objeto, pero múltiples
 * se parsean como array. Este helper normaliza ese comportamiento.
 *
 * Replica el patrón Python: if isinstance(x, dict): x = [x]
 */
export function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

/**
 * Acceso seguro a propiedades anidadas en objetos parseados de XML.
 * Equivalente a dict.get('key', {}).get('subkey') de Python.
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  ...keys: string[]
): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
