/**
 * HTTP Client con retry y exponential backoff
 * Reemplaza: requests.get() de Python
 */

import { createLogger } from './logger.js';

const log = createLogger('HTTP');

export interface FetchOptions {
  timeout?: number;       // ms, default 60000
  maxRetries?: number;    // default 3
  retryDelay?: number;    // ms, default 5000
  headers?: Record<string, string>;
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

/**
 * Fetch con retry y exponential backoff.
 * Replica la lógica Python: max_retries=3, timeout=60s, delay * (attempt+1)
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {}
): Promise<string> {
  const {
    timeout = 60_000,
    maxRetries = 3,
    retryDelay = 5_000,
    headers = {},
  } = opts;

  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: mergedHeaders,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);

      const isLastAttempt = attempt === maxRetries - 1;
      const errMsg = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        log.error(`Failed after ${maxRetries} attempts: ${url} - ${errMsg}`);
        throw error;
      }

      const delay = retryDelay * (attempt + 1);
      log.warn(`Attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${errMsg}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  // Should never reach here
  throw new Error(`fetchWithRetry: unreachable`);
}

/**
 * Fetch XML text sin retry (para llamadas simples como discovery)
 * Retorna null en caso de error (replica el patrón Python: return None)
 */
export async function fetchText(
  url: string,
  timeout = 30_000
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: DEFAULT_HEADERS,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/** Sleep helper: await sleep(1000) */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
