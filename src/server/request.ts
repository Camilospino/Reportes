import { headers } from "next/headers";

/**
 * IP del cliente. En producción Caddy es el único que habla con la app y reescribe
 * X-Forwarded-For, así que el primer valor es confiable.
 */
export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip: ip?.slice(0, 64) ?? null, userAgent: h.get("user-agent")?.slice(0, 255) ?? null };
}

/**
 * Protección CSRF para Route Handlers (las Server Actions ya la traen de Next.js):
 * el encabezado Origin debe coincidir con el host que atiende la petición.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
