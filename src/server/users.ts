/** Servicio de usuarios y autenticación. */
import { prisma } from "./db";
import { writeAudit } from "./audit";
import { AppError, forbidden, isUniqueViolation, notFound } from "./errors";
import { generateTempPassword, hashPassword, verifyDummy, verifyPassword } from "./password";
import { check, consume, hit, reset } from "./rate-limit";
import type { Ctx } from "./reports";

// ─── Inicio de sesión ──────────────────────────────────────────────────

const LOGIN_FAIL = "Usuario o contraseña incorrectos.";

/**
 * Verifica credenciales. Límite: 5 intentos FALLIDOS por usuario y 30 por IP cada 15 minutos
 * (los ingresos correctos no cuentan).
 * Devuelve el usuario o lanza AppError con un mensaje que no revela si el usuario existe.
 */
export async function authenticate(
  username: string,
  password: string,
  ip: string | null,
): Promise<{ id: string; role: "ADMIN" | "TECNICO" }> {
  const window = 15 * 60 * 1000;
  const userKey = `login:u:${username}`;
  const ipKey = `login:ip:${ip ?? "?"}`;
  const byUser = check(userKey, 5);
  const byIp = check(ipKey, 30);
  if (!byUser.allowed || !byIp.allowed) {
    const mins = Math.ceil(Math.max(byUser.retryAfterSeconds, byIp.retryAfterSeconds) / 60);
    throw new AppError(`Demasiados intentos. Espere ${mins} minuto(s) e intente de nuevo.`, 429);
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, role: true, active: true, passwordHash: true },
  });
  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyDummy(password);

  if (!user || !valid || !user.active) {
    hit(userKey, window);
    hit(ipKey, window);
    await writeAudit({
      actorId: null,
      entity: "AUTH",
      action: "LOGIN_FALLIDO",
      targetUserId: user?.id,
      data: { username: username.slice(0, 50), motivo: !user ? "no existe" : !valid ? "clave" : "inactivo" },
      ip,
    });
    throw new AppError(LOGIN_FAIL, 401);
  }

  reset(userKey);
  await writeAudit({ actorId: user.id, entity: "AUTH", action: "LOGIN_OK", ip });
  return { id: user.id, role: user.role };
}

export async function changeOwnPassword(
  ctx: Ctx & { sessionId: string },
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: ctx.actor.id }, select: { passwordHash: true } });
  if (!user) throw notFound();
  const limit = consume(`pwchange:${ctx.actor.id}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) throw new AppError("Demasiados intentos. Espere unos minutos.", 429);
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("La contraseña actual no es correcta.", 400, {
      currentPassword: ["La contraseña actual no es correcta."],
    });
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: ctx.actor.id }, data: { passwordHash, mustChangePassword: false } }),
    // Cierra las demás sesiones abiertas (p. ej. un celular perdido); conserva la actual.
    prisma.session.deleteMany({ where: { userId: ctx.actor.id, id: { not: ctx.sessionId } } }),
  ]);
  await writeAudit({ actorId: ctx.actor.id, entity: "USER", action: "CLAVE_CAMBIAR", targetUserId: ctx.actor.id, ip: ctx.ip });
}

// ─── Gestión de técnicos (solo admin) ──────────────────────────────────

export function listTechnicians() {
  return prisma.user.findMany({
    where: { role: "TECNICO" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
      _count: { select: { assignedReports: { where: { status: "EN_PROCESO" } } } },
    },
  });
}

export function listActiveTechniciansForSelect() {
  return prisma.user.findMany({
    where: { role: "TECNICO", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

function assertAdmin(ctx: Ctx) {
  if (ctx.actor.role !== "ADMIN") throw forbidden();
}

async function getTechnician(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true } });
  if (!u || u.role !== "TECNICO") throw notFound("El técnico no existe.");
  return u;
}

/** Crea un técnico con contraseña temporal (se muestra UNA vez al admin). */
export async function createTechnician(
  ctx: Ctx,
  input: { name: string; username: string; phone?: string },
): Promise<{ username: string; tempPassword: string }> {
  assertAdmin(ctx);
  const tempPassword = generateTempPassword();
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        username: input.username,
        phone: input.phone ?? null,
        role: "TECNICO",
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
      select: { id: true },
    });
    await writeAudit({
      actorId: ctx.actor.id,
      entity: "USER",
      action: "USUARIO_CREAR",
      targetUserId: user.id,
      data: { username: input.username, name: input.name },
      ip: ctx.ip,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("Ese usuario ya existe.", 409, { username: ["Ese usuario ya existe. Elija otro."] });
    }
    throw e;
  }
  return { username: input.username, tempPassword };
}

export async function setTechnicianActive(ctx: Ctx, userId: string, active: boolean): Promise<void> {
  assertAdmin(ctx);
  await getTechnician(userId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await writeAudit(
      {
        actorId: ctx.actor.id,
        entity: "USER",
        action: active ? "USUARIO_ACTIVAR" : "USUARIO_DESACTIVAR",
        targetUserId: userId,
        ip: ctx.ip,
      },
      tx,
    );
  });
}

export async function resetTechnicianPassword(ctx: Ctx, userId: string): Promise<{ username: string; tempPassword: string }> {
  assertAdmin(ctx);
  await getTechnician(userId);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
      select: { username: true },
    });
    await tx.session.deleteMany({ where: { userId } });
    await writeAudit(
      { actorId: ctx.actor.id, entity: "USER", action: "CLAVE_RESTABLECER", targetUserId: userId, ip: ctx.ip },
      tx,
    );
    return u;
  });
  return { username: user.username, tempPassword };
}
