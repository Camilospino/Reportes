/**
 * Limitador de intentos en memoria (ventana fija). Suficiente para UN servidor.
 * Si algún día se ejecutan varias instancias, mover a PostgreSQL o Redis.
 *
 * Uso típico (login): `check` antes de verificar; `hit` solo cuando el intento FALLA.
 * Así, los ingresos correctos (p. ej. 30 técnicos en el mismo Wi-Fi) nunca bloquean a nadie.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

function current(key: string, now: number): Bucket | undefined {
  const b = buckets.get(key);
  if (b && b.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return b;
}

/** ¿Se permite otro intento? (no cuenta el intento) */
export function check(key: string, limit: number, now = Date.now()): RateLimitResult {
  const b = current(key, now);
  return { allowed: !b || b.count < limit, retryAfterSeconds: b ? Math.ceil((b.resetAt - now) / 1000) : 0 };
}

/** Registra un intento (fallido) en la ventana. */
export function hit(key: string, windowMs: number, now = Date.now()): void {
  let b = current(key, now);
  if (!b) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > 10_000) sweep(now);
}

/** Cuenta y verifica en un paso (para acciones donde todo intento cuenta). */
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  hit(key, windowMs, now);
  const b = buckets.get(key)!;
  return { allowed: b.count <= limit, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
}

export function reset(key: string): void {
  buckets.delete(key);
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}
