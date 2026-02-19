/**
 * Logging estructurado para ETLs
 * Reemplaza los print() de Python con formato consistente
 */

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  success: (message: string, ...args: unknown[]) => void;
}

export function createLogger(name: string): Logger {
  const timestamp = () => new Date().toISOString().substring(11, 19);

  return {
    info: (message: string, ...args: unknown[]) => {
      console.log(`[${timestamp()}] [${name}] ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`[${timestamp()}] [${name}] ⚠️ ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(`[${timestamp()}] [${name}] ❌ ${message}`, ...args);
    },
    success: (message: string, ...args: unknown[]) => {
      console.log(`[${timestamp()}] [${name}] ✅ ${message}`, ...args);
    },
  };
}
