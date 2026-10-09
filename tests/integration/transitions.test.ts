import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  TAKEN_BY_OTHER_MSG,
  applyTransition,
  assignTechnician,
  createReport,
  listForTechnician,
  uploadPhoto,
  type Ctx,
} from "@/server/reports";

/**
 * Reglas críticas verificadas en el SERVIDOR (sin pasar por la interfaz),
 * como lo haría alguien que fabrica las peticiones a mano.
 */
let admin: Ctx, t1: Ctx, t2: Ctx;
const suffix = Math.random().toString(36).slice(2, 8);

async function newUser(role: "ADMIN" | "TECNICO"): Promise<Ctx> {
  const u = await prisma.user.create({
    data: { name: `Test ${role}`, username: `it-${role.toLowerCase()}-${suffix}-${Math.random().toString(36).slice(2, 6)}`, role, passwordHash: "x" },
  });
  return { actor: { id: u.id, role }, ip: "127.0.0.1" };
}

async function newReport() {
  return createReport(admin, {
    street: "Calle Test 1",
    neighborhood: "Centro",
    city: "Cartagena de Indias, Bolívar",
    referencePoint: undefined,
    category: "OTRO",
    description: "Prueba",
    priority: "MEDIA",
    clientName: "Cliente",
    clientPhone: "3000000000",
    contractNumber: "CTG-000001",
    assignedToId: null,
  });
}

const status = async (id: string) => (await prisma.report.findUniqueOrThrow({ where: { id } })).status;
const auditCount = (reportId: string) => prisma.auditLog.count({ where: { reportId } });
const jpeg = () => sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer();

beforeAll(async () => {
  admin = await newUser("ADMIN");
  t1 = await newUser("TECNICO");
  t2 = await newUser("TECNICO");
});
afterAll(() => prisma.$disconnect());

describe("reglas del servidor", () => {
  it("REALIZADO sin foto es rechazado aunque se salte el frontend", async () => {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    await expect(
      applyTransition(t1, { reportId: id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [] }),
    ).rejects.toThrow(/al menos una foto/);
    expect(await status(id)).toBe("EN_PROCESO");
  });

  it("REALIZADO con foto de OTRO reporte falla y no deja cambios a medias (atomicidad)", async () => {
    const a = await newReport();
    const b = await newReport();
    await applyTransition(t1, { reportId: a.id, transition: "TOMAR", requestId: randomUUID() });
    await applyTransition(t1, { reportId: b.id, transition: "TOMAR", requestId: randomUUID() });
    const photoOfB = await uploadPhoto(t1, b.id, "EVIDENCIA", await jpeg());
    const before = await auditCount(a.id);

    await expect(
      applyTransition(t1, { reportId: a.id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [photoOfB.id] }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await status(a.id)).toBe("EN_PROCESO");
    expect(await auditCount(a.id)).toBe(before);
  });

  it("REALIZADO con foto propia funciona, vincula la foto y registra en bitácora", async () => {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    const photo = await uploadPhoto(t1, id, "EVIDENCIA", await jpeg());
    await applyTransition(t1, { reportId: id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [photo.id] });
    expect(await status(id)).toBe("REALIZADO");
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: photo.id }, include: { auditLog: true } });
    expect(att.auditLog?.action).toBe("REALIZADO");
  });

  it("dos técnicos tocan 'Tomar' a la vez: solo uno lo consigue", async () => {
    const { id } = await newReport();
    const results = await Promise.allSettled([
      applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() }),
      applyTransition(t2, { reportId: id, transition: "TOMAR", requestId: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { reportId: id, action: "TOMAR" } })).toBe(1);
  });

  it("un reintento con el mismo requestId no duplica el cambio (idempotencia)", async () => {
    const { id } = await newReport();
    const requestId = randomUUID();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId });
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId }); // no lanza
    expect(await prisma.auditLog.count({ where: { reportId: id, action: "TOMAR" } })).toBe(1);
  });

  it("un técnico no puede ejecutar decisiones de administrador en el servidor", async () => {
    const { id } = await newReport();
    await expect(applyTransition(t1, { reportId: id, transition: "CANCELAR", requestId: randomUUID(), comment: "x" })).rejects.toThrow(
      /permiso/,
    );
    expect(await status(id)).toBe("PENDIENTE");
  });

  it("no se suben fotos a un reporte ajeno", async () => {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    await expect(uploadPhoto(t2, id, "EVIDENCIA", await jpeg())).rejects.toThrow(/en proceso/);
  });

  it("archivos que no son imagen son rechazados por contenido", async () => {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    await expect(uploadPhoto(t1, id, "EVIDENCIA", Buffer.from("<script>alert(1)</script>"))).rejects.toThrow(/imagen válida/);
  });

  it("cada cambio de estado queda en la bitácora con estado anterior y nuevo", async () => {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    await applyTransition(t1, { reportId: id, transition: "APLAZADO", requestId: randomUUID(), data: { motivo: "Lluvia" } });
    await applyTransition(admin, { reportId: id, transition: "REPROGRAMAR", requestId: randomUUID(), comment: "Ir el lunes" });
    const log = await prisma.auditLog.findMany({ where: { reportId: id }, orderBy: { id: "asc" } });
    expect(log.map((l) => [l.action, l.fromStatus, l.toStatus])).toEqual([
      ["CREAR", null, "PENDIENTE"],
      ["TOMAR", "PENDIENTE", "EN_PROCESO"],
      ["APLAZADO", "EN_PROCESO", "APLAZADO"],
      ["REPROGRAMAR", "APLAZADO", "PENDIENTE"],
    ]);
    expect(log.every((l) => l.actorId)).toBe(true);
  });

  it("asignar técnico desde la lista: solo en Pendiente, con control de versión y en la bitácora", async () => {
    const { id } = await newReport();
    const v0 = (await prisma.report.findUniqueOrThrow({ where: { id } })).version;
    const { version: v1 } = await assignTechnician(admin, id, t1.actor.id, v0);
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).assignedToId).toBe(t1.actor.id);
    // Versión vieja (otro admin cambió el reporte entre tanto): conflicto, no se pisa.
    await expect(assignTechnician(admin, id, t2.actor.id, v0)).rejects.toBeInstanceOf(AppError);
    const edit = await prisma.auditLog.findFirst({ where: { reportId: id, action: "EDITAR" } });
    expect(edit?.data).toMatchObject({ changes: { assignedToId: { from: null } } });
    // En proceso ya no se puede cambiar el técnico.
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    await expect(assignTechnician(admin, id, t2.actor.id, v1 + 1)).rejects.toThrow(/en proceso/);
    // Un técnico no puede usarla.
    await expect(assignTechnician(t1, id, null, v1 + 1)).rejects.toBeInstanceOf(AppError);
  });
});

/**
 * Acciones de la pantalla de inicio del técnico (tomarReporte, iniciarReporte, marcarRealizado).
 * Las Server Actions solo validan la entrada y llaman a applyTransition con estos parámetros,
 * tomando al técnico de la sesión.
 */
describe("inicio del técnico: tomar, iniciar y marcar realizado", () => {
  const tomar = (ctx: Ctx, reportId: string) =>
    applyTransition(ctx, { reportId, transition: "TOMAR", requestId: randomUUID(), scope: "disponible" });
  const iniciar = (ctx: Ctx, reportId: string) =>
    applyTransition(ctx, { reportId, transition: "TOMAR", requestId: randomUUID(), scope: "propio" });
  const realizado = async (ctx: Ctx, reportId: string, photoOwner: Ctx = ctx) => {
    const photo = await uploadPhoto(photoOwner, reportId, "EVIDENCIA", await jpeg());
    return applyTransition(ctx, { reportId, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [photo.id], data: { nota: "Listo" } });
  };
  const row = (id: string) => prisma.report.findUniqueOrThrow({ where: { id } });
  const assignTo = async (id: string, tech: Ctx) => assignTechnician(admin, id, tech.actor.id, (await row(id)).version);

  it("tomar: dos técnicos a la vez, gana uno y el otro recibe 'Otro técnico ya tomó este reporte'", async () => {
    const { id } = await newReport();
    const results = await Promise.allSettled([tomar(t1, id), tomar(t2, id)]);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed).toHaveLength(1);
    expect((failed[0]!.reason as Error).message).toBe(TAKEN_BY_OTHER_MSG);
    const r = await row(id);
    expect(r.status).toBe("EN_PROCESO");
    expect([t1.actor.id, t2.actor.id]).toContain(r.assignedToId);
    expect(r.startedAt).toBeInstanceOf(Date);
  });

  it("tomar: no se puede tomar uno ya tomado ni uno que el admin asignó a otro técnico", async () => {
    const tomado = await newReport();
    await tomar(t1, tomado.id);
    await expect(tomar(t2, tomado.id)).rejects.toThrow(TAKEN_BY_OTHER_MSG);

    const asignado = await newReport();
    await assignTo(asignado.id, t1);
    await expect(tomar(t2, asignado.id)).rejects.toThrow(TAKEN_BY_OTHER_MSG);
    expect((await row(asignado.id)).assignedToId).toBe(t1.actor.id);
  });

  it("iniciar: solo el técnico asignado, y solo desde Pendiente; guarda la fecha de inicio", async () => {
    const { id } = await newReport();
    await expect(iniciar(t1, id)).rejects.toThrow(/no está a su cargo/); // sin técnico
    await assignTo(id, t1);
    await expect(iniciar(t2, id)).rejects.toThrow(/no está a su cargo/); // de otro técnico
    expect((await row(id)).status).toBe("PENDIENTE");

    await iniciar(t1, id);
    const r = await row(id);
    expect(r.status).toBe("EN_PROCESO");
    expect(r.startedAt).toBeInstanceOf(Date);
    await expect(iniciar(t1, id)).rejects.toThrow(/cambió de estado/); // ya está En proceso
  });

  it("marcar realizado: otro técnico no puede cerrarlo; el dueño sí y queda la fecha de cierre", async () => {
    const { id } = await newReport();
    await tomar(t1, id);
    await expect(realizado(t2, id, t1)).rejects.toThrow(/no está a su cargo/);
    expect((await row(id)).status).toBe("EN_PROCESO");

    await realizado(t1, id);
    const r = await row(id);
    expect(r.status).toBe("REALIZADO");
    expect(r.completedAt).toBeInstanceOf(Date);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { reportId: id, action: "REALIZADO" } });
    expect(log.data).toEqual({ nota: "Listo" });
  });

  it("marcar realizado: solo desde En proceso", async () => {
    const { id } = await newReport();
    await assignTo(id, t1); // asignado pero Pendiente
    await expect(
      applyTransition(t1, { reportId: id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [randomUUID()] }),
    ).rejects.toThrow(/cambió de estado/);
  });

  it("fechas: al reabrir se borran inicio y cierre; al verificar se conserva el cierre", async () => {
    const a = await newReport();
    await tomar(t1, a.id);
    await realizado(t1, a.id);
    await applyTransition(admin, { reportId: a.id, transition: "RECHAZAR", requestId: randomUUID(), comment: "Falta foto" });
    let r = await row(a.id);
    expect([r.status, r.startedAt, r.completedAt]).toEqual(["PENDIENTE", null, null]);

    const b = await newReport();
    await tomar(t1, b.id);
    await realizado(t1, b.id);
    const closed = (await row(b.id)).completedAt;
    await applyTransition(admin, { reportId: b.id, transition: "VERIFICAR", requestId: randomUUID() });
    r = await row(b.id);
    expect(r.status).toBe("VERIFICADO");
    expect(r.completedAt).toEqual(closed);
  });

  it("'Hechos hoy' cuenta los cerrados hoy por el técnico (también los ya verificados)", async () => {
    const tech = await newUser("TECNICO");
    const before = (await listForTechnician(tech.actor.id, 1)).doneToday;
    const a = await newReport();
    await tomar(tech, a.id);
    await realizado(tech, a.id);
    await applyTransition(admin, { reportId: a.id, transition: "VERIFICAR", requestId: randomUUID() });
    const b = await newReport();
    await tomar(tech, b.id); // en proceso: no cuenta
    const ayer = await newReport();
    await tomar(tech, ayer.id);
    await realizado(tech, ayer.id);
    await prisma.report.update({ where: { id: ayer.id }, data: { completedAt: new Date(Date.now() - 36 * 3600_000) } });

    const { doneToday, mine } = await listForTechnician(tech.actor.id, 1);
    expect(doneToday - before).toBe(1);
    expect(mine.map((m) => m.id)).toEqual([b.id]);
    expect(mine[0]!.clientPhone).toBe("3000000000");
  });
});

/**
 * Bandeja del Panel (verificarReporte, devolverReporte, reprogramarReporte, cancelarReporte).
 * Las acciones exigen ADMIN y llaman a applyTransition con estos mismos parámetros (onlyFrom + nota).
 */
describe("Panel del administrador: decisiones de la bandeja", () => {
  const PANEL = {
    verificar: { transition: "VERIFICAR", onlyFrom: ["REALIZADO"] },
    devolver: { transition: "RECHAZAR", onlyFrom: ["REALIZADO"] },
    reprogramar: { transition: "REPROGRAMAR", onlyFrom: ["APLAZADO", "CLIENTE_AUSENTE"] },
    cancelar: { transition: "CANCELAR", onlyFrom: ["APLAZADO", "CLIENTE_AUSENTE"] },
  } as const;
  const decide = (ctx: Ctx, d: keyof typeof PANEL, reportId: string, nota?: string) =>
    applyTransition(ctx, { reportId, requestId: randomUUID(), comment: nota ?? null, ...PANEL[d] });
  const row = (id: string) => prisma.report.findUniqueOrThrow({ where: { id } });
  const lastLog = (reportId: string) => prisma.auditLog.findFirstOrThrow({ where: { reportId }, orderBy: { id: "desc" } });

  async function inState(s: "REALIZADO" | "APLAZADO" | "CLIENTE_AUSENTE") {
    const { id } = await newReport();
    await applyTransition(t1, { reportId: id, transition: "TOMAR", requestId: randomUUID() });
    if (s === "REALIZADO") {
      const photo = await uploadPhoto(t1, id, "EVIDENCIA", await jpeg());
      await applyTransition(t1, { reportId: id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [photo.id] });
    } else if (s === "APLAZADO") {
      await applyTransition(t1, { reportId: id, transition: "APLAZADO", requestId: randomUUID(), data: { motivo: "Lluvia" } });
    } else {
      await applyTransition(t1, { reportId: id, transition: "CLIENTE_AUSENTE", requestId: randomUUID(), data: { fechaIntento: "2026-10-09T10:00" } });
    }
    return id;
  }

  it("verificar: Realizado → Verificado, con la nota en el historial", async () => {
    const id = await inState("REALIZADO");
    const before = (await row(id)).updatedAt;
    await decide(admin, "verificar", id, "Cliente confirmó");
    const r = await row(id);
    expect(r.status).toBe("VERIFICADO");
    expect(r.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(await lastLog(id)).toMatchObject({ action: "VERIFICAR", fromStatus: "REALIZADO", toStatus: "VERIFICADO", actorId: admin.actor.id, comment: "Cliente confirmó" });
  });

  it("devolver: Realizado → Pendiente conservando el técnico; la nota es opcional", async () => {
    const id = await inState("REALIZADO");
    await decide(admin, "devolver", id);
    const r = await row(id);
    expect([r.status, r.assignedToId]).toEqual(["PENDIENTE", t1.actor.id]);
    expect(await lastLog(id)).toMatchObject({ action: "RECHAZAR", fromStatus: "REALIZADO", toStatus: "PENDIENTE", comment: null });
  });

  it("reprogramar: Aplazado → Pendiente conservando el técnico", async () => {
    const id = await inState("APLAZADO");
    await decide(admin, "reprogramar", id, "Volver el lunes");
    const r = await row(id);
    expect([r.status, r.assignedToId]).toEqual(["PENDIENTE", t1.actor.id]);
    expect(await lastLog(id)).toMatchObject({ action: "REPROGRAMAR", fromStatus: "APLAZADO", comment: "Volver el lunes" });
  });

  it("cancelar: Cliente ausente → Cancelado; desde la bandeja NO se cancela un Pendiente", async () => {
    const id = await inState("CLIENTE_AUSENTE");
    await decide(admin, "cancelar", id, "Cliente desistió");
    expect((await row(id)).status).toBe("CANCELADO");
    expect(await lastLog(id)).toMatchObject({ action: "CANCELAR", fromStatus: "CLIENTE_AUSENTE", toStatus: "CANCELADO", comment: "Cliente desistió" });

    const { id: pendiente } = await newReport();
    await expect(decide(admin, "cancelar", pendiente)).rejects.toMatchObject({ status: 409 });
    expect((await row(pendiente)).status).toBe("PENDIENTE");
  });

  it("verificar dos veces (dos pestañas): la segunda falla con conflicto y no escribe historial", async () => {
    const id = await inState("REALIZADO");
    await decide(admin, "verificar", id);
    const logs = await auditCount(id);
    await expect(decide(admin, "verificar", id)).rejects.toMatchObject({ status: 409 });
    expect(await auditCount(id)).toBe(logs);
  });

  it("verificar a la vez desde dos pestañas: solo una gana", async () => {
    const id = await inState("REALIZADO");
    const results = await Promise.allSettled([decide(admin, "verificar", id), decide(admin, "verificar", id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { reportId: id, action: "VERIFICAR" } })).toBe(1);
  });

  it("un técnico no puede decidir en la bandeja", async () => {
    const id = await inState("REALIZADO");
    await expect(decide(t1, "verificar", id)).rejects.toThrow(/permiso/);
    expect((await row(id)).status).toBe("REALIZADO");
  });
});

