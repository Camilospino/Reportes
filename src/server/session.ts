import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/domain/types";
import { prisma } from "./db";

/**
 * Sesiones en base de datos.
 * - La cookie guarda un token aleatorio de 256 bits; en la BD solo se guarda su SHA-256.
 * - Cookie httpOnly + SameSite=Lax (+ Secure y prefijo __Host- cuando hay HTTPS).
 * - Desactivar un usuario o restablecer su clave borra sus sesiones (cierre inmediato).
 *
 * IMPORTANTE: la autorización se verifica aquí, en cada página / acción / API,
 * nunca solo en src/proxy.ts.
 */

const SECURE = (process.env.APP_URL ?? "").startsWith("https://");
// SESSION_COOKIE_SUFFIX separa la sesión de QA (localhost:3300) de la de desarrollo (localhost:3100).
const COOKIE_NAME = (SECURE ? "__Host-sid" : "sid") + (process.env.SESSION_COOKIE_SUFFIX ?? "");

/** Los técnicos trabajan en campo: sesión larga para no pedir clave a cada rato. */
const SESSION_TTL_MS: Record<Role, number> = {
  TECNICO: 30 * 24 * 60 * 60 * 1000,
  ADMIN: 12 * 60 * 60 * 1000,
};

export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  sessionId: string;
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function homeFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/tecnico";
}

export async function createSession(
  user: { id: string; role: Role },
  meta: { ip: string | null; userAgent: string | null },
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[user.role]);
  await prisma.session.create({
    data: { id: sha256(token), userId: user.id, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });
  // Limpieza oportunista de sesiones vencidas (barata gracias al índice en expires_at).
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE_NAME);
}

/** Usuario de la petición actual, o null. Memoizado por petición con React cache(). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, name: true, username: true, role: true, active: true, mustChangePassword: true } },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    sessionId: session.id,
  };
});

/** Exige sesión. Si debe cambiar la contraseña, lo envía a esa pantalla primero. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/cambiar-clave");
  return user;
}

/**
 * Exige un rol. Un técnico que fuerce una URL de administrador (o viceversa)
 * es enviado a su propia página de inicio; nunca se ejecuta el código protegido.
 */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

/** Variante para Route Handlers (API): no redirige, devuelve null si no está autorizado. */
export async function getApiUser(role?: Role): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  if (role && user.role !== role) return null;
  return user;
}
