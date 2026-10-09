/** Utilidades del navegador para conexiones inestables. */

/** UUID v4 (crypto.randomUUID solo existe en contextos seguros; esto funciona siempre). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintenta `fn` ante errores de RED (no ante errores de validación, que vuelven como resultado).
 * Espera 1 s, 2 s, 4 s, 8 s… entre intentos.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 5, onRetry }: { attempts?: number; onRetry?: (attempt: number) => void } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (e instanceof PermanentError) throw e;
      if (i < attempts - 1) {
        onRetry?.(i + 1);
        await sleep(1000 * 2 ** i);
      }
    }
  }
  throw lastError;
}

/** Error que NO debe reintentarse (p. ej. 4xx del servidor). */
export class PermanentError extends Error {}

export const NETWORK_ERROR_MSG = "Sin conexión o señal débil. Revise la señal e intente de nuevo; no se perdió nada.";
