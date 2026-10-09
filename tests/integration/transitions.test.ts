import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { applyTransition, createReport, uploadPhoto, type Ctx } from "@/server/reports";

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
});
