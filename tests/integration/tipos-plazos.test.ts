import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ReportInput } from "@/domain/schemas";
import { GET as cronGET } from "@/app/api/cron/plazos/route";
import { prisma } from "@/server/db";
import { runDeadlineCheck } from "@/server/deadlines";
import { saveDeadlineConfig } from "@/server/deadline-config";
import { getNotificationSummary, markAllNotificationsRead, markNotificationRead } from "@/server/notifications";
import { applyTransition, createReport, updateReport, uploadPhoto, type Ctx } from "@/server/reports";

/**
 * Tipos de orden (Daño, Instalación, Retiro), cierre de equipos, plazo de 72 h y avisos,
 * verificados en el SERVIDOR sin pasar por la interfaz.
 */
let admin: Ctx, t1: Ctx, t2: Ctx;
const suffix = Math.random().toString(36).slice(2, 8);
const HOUR = 3_600_000;

async function newUser(role: "ADMIN" | "TECNICO", name = `Test ${role}`): Promise<Ctx> {
  const u = await prisma.user.create({
    data: { name, username: `tp-${role.toLowerCase()}-${suffix}-${Math.random().toString(36).slice(2, 6)}`, role, passwordHash: "x" },
  });
  return { actor: { id: u.id, role }, ip: "127.0.0.1" };
}

const common = {
  street: "Calle Plazo 1",
  neighborhood: "Manga",
  city: "Cartagena de Indias, Bolívar" as const,
  referencePoint: undefined,
  priority: "MEDIA" as const,
  clientName: "Cliente",
  clientPhone: "3000000000",
  contractNumber: "CTG-000777",
  assignedToId: null,
};

const install = (extra: Partial<ReportInput> = {}) =>
  createReport(admin, {
    ...common,
    type: "INSTALACION",
    plan: "300 Mbps",
    suggestedDate: undefined,
    description: undefined,
    equipment: [{ kind: "ONU" }, { kind: "Router", serial: "RT-1" }],
    ...extra,
  } as ReportInput);

const withdrawal = () =>
  createReport(admin, {
    ...common,
    type: "RETIRO",
    withdrawalReason: "MORA",
    withdrawalReasonOther: undefined,
    description: undefined,
    equipment: [{ kind: "Router", serial: "ZTE-9" }, { kind: "Decodificador" }],
  });

const damage = () => createReport(admin, { ...common, type: "DANO", category: "OTRO", description: "Prueba" });

const jpeg = () => sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer();
const row = (id: string) => prisma.report.findUniqueOrThrow({ where: { id }, include: { equipment: { orderBy: { createdAt: "asc" } } } });
const take = (ctx: Ctx, id: string) => applyTransition(ctx, { reportId: id, transition: "TOMAR", requestId: randomUUID() });

/** Toma la orden, sube una foto y la marca Realizado con el cierre de equipos dado. */
async function complete(ctx: Ctx, id: string, equipment: Parameters<typeof applyTransition>[1]["equipment"]) {
  const photo = await uploadPhoto(ctx, id, "EVIDENCIA", await jpeg());
  return applyTransition(ctx, { reportId: id, transition: "REALIZADO", requestId: randomUUID(), attachmentIds: [photo.id], equipment });
}

/** Mueve la creación y el plazo de la orden como si hubieran pasado `h` horas (simula el paso del tiempo). */
async function age(id: string, h: number) {
  const createdAt = new Date(Date.now() - h * HOUR);
  await prisma.report.update({ where: { id }, data: { createdAt, dueAt: new Date(createdAt.getTime() + 72 * HOUR) } });
}

const notificationsOf = (reportId: string) => prisma.notification.findMany({ where: { reportId }, orderBy: [{ threshold: "asc" }, { userId: "asc" }] });
const activeAdmins = () => prisma.user.count({ where: { role: "ADMIN", active: true } });

beforeAll(async () => {
  admin = await newUser("ADMIN");
  t1 = await newUser("TECNICO", "Carlos Prueba");
  t2 = await newUser("TECNICO");
});
afterAll(() => prisma.$disconnect());

describe("tipos de orden y equipos", () => {
  it("crear: guarda el tipo, sus campos y los equipos; el plazo es creadoEn + 72 h", async () => {
    const { id } = await install();
    const r = await row(id);
    expect(r).toMatchObject({ type: "INSTALACION", category: null, plan: "300 Mbps", warnFromHours: 24, status: "PENDIENTE" });
    expect(r.dueAt.getTime() - r.createdAt.getTime()).toBe(72 * HOUR);
    expect(r.equipment.map((e) => [e.kind, e.serial, e.action])).toEqual([
      ["ONU", null, "INSTALAR"],
      ["Router", "RT-1", "INSTALAR"],
    ]);
    const created = await prisma.auditLog.findFirstOrThrow({ where: { reportId: id, action: "CREAR" } });
    expect(created.data).toEqual({ tipo: "INSTALACION" });
  });

  it("instalación: NO se cierra sin el serial de cada equipo; con seriales sí, y quedan guardados", async () => {
    const { id } = await install();
    await take(t1, id);
    const [onu, router] = (await row(id)).equipment;
    await expect(complete(t1, id, [])).rejects.toThrow("Escriba el serial de cada equipo instalado.");
    await expect(complete(t1, id, [{ id: onu!.id }, { id: router!.id }])).rejects.toThrow("Escriba el serial de cada equipo instalado.");
    expect((await row(id)).status).toBe("EN_PROCESO");

    // El Router ya traía serial; basta con escribir el de la ONU.
    await complete(t1, id, [{ id: onu!.id, serial: "ONU-555" }]);
    const r = await row(id);
    expect(r.status).toBe("REALIZADO");
    expect(r.equipment.map((e) => e.serial)).toEqual(["ONU-555", "RT-1"]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { reportId: id, action: "REALIZADO" } });
    expect((log.data as { equipos: unknown[] }).equipos).toHaveLength(2);
  });

  it("retiro: NO se cierra sin marcar cada equipo ni sin estado de los recibidos; un no recibido sí cierra", async () => {
    const { id } = await withdrawal();
    await take(t1, id);
    const [routerEq, deco] = (await row(id)).equipment;
    await expect(complete(t1, id, [{ id: routerEq!.id, received: true, condition: "BUENO" }])).rejects.toThrow("Marque si recibió cada equipo.");
    await expect(
      complete(t1, id, [
        { id: routerEq!.id, received: true },
        { id: deco!.id, received: false },
      ]),
    ).rejects.toThrow("Indique el estado de cada equipo recibido.");

    await complete(t1, id, [
      { id: routerEq!.id, received: true, condition: "DANADO", observation: "Carcasa rota" },
      { id: deco!.id, received: false, condition: "BUENO" },
    ]);
    const r = await row(id);
    expect(r.status).toBe("REALIZADO");
    expect(r.equipment.map((e) => [e.received, e.condition, e.observation])).toEqual([
      [true, "DANADO", "Carcasa rota"],
      [false, null, null], // sin recibir no tiene estado
    ]);
  });

  it("un equipo de OTRA orden en el cierre es rechazado", async () => {
    const a = await withdrawal();
    const b = await withdrawal();
    await take(t1, a.id);
    const other = (await row(b.id)).equipment[0]!;
    await expect(complete(t1, a.id, [{ id: other.id, received: false }])).rejects.toThrow("La lista de equipos cambió");
  });

  it("daño: sigue igual (sin equipos) y no acepta datos de equipos", async () => {
    const { id } = await damage();
    await take(t1, id);
    await expect(complete(t1, id, [{ id: randomUUID(), serial: "X" }])).rejects.toThrow("Esta orden no tiene equipos.");
    await complete(t1, id, []);
    expect((await row(id)).status).toBe("REALIZADO");
  });

  it("editar: el tipo no cambia; los equipos se agregan, se quitan y conservan sus datos", async () => {
    const { id } = await install();
    const r = await row(id);
    const keep = r.equipment[1]!; // Router RT-1
    await updateReport(admin, id, { ...common, type: "INSTALACION", plan: "500 Mbps", suggestedDate: undefined, description: undefined, equipment: [{ id: keep.id, kind: "Router", serial: "RT-1" }, { kind: "Antena" }] }, r.version);
    const after = await row(id);
    expect(after.plan).toBe("500 Mbps");
    expect(after.equipment.map((e) => [e.id === keep.id, e.kind])).toEqual([
      [true, "Router"],
      [false, "Antena"],
    ]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { reportId: id, action: "EDITAR" } });
    expect((log.data as { changes: Record<string, unknown> }).changes).toHaveProperty("equipment");
    await expect(updateReport(admin, id, { ...common, type: "DANO", category: "OTRO", description: "x" }, after.version)).rejects.toThrow("El tipo de orden no se puede cambiar.");
  });
});

describe("plazo de 72 h", () => {
  it("Realizado guarda cumplioPlazo; verificar lo conserva", async () => {
    const { id } = await damage();
    await take(t1, id);
    await complete(t1, id, []);
    expect((await row(id)).metDeadline).toBe(true);

    const late = await damage();
    await take(t1, late.id);
    await age(late.id, 80);
    await complete(t1, late.id, []);
    expect((await row(late.id)).metDeadline).toBe(false);
    await applyTransition(admin, { reportId: late.id, transition: "VERIFICAR", requestId: randomUUID() });
    expect(await row(late.id)).toMatchObject({ status: "VERIFICADO", metDeadline: false });
  });

  it("devolver una orden Realizada: el reloj sigue con el MISMO venceEn y se limpia el cierre", async () => {
    const { id } = await damage();
    await take(t1, id);
    await complete(t1, id, []);
    const before = await row(id);
    await applyTransition(admin, { reportId: id, transition: "RECHAZAR", requestId: randomUUID(), comment: "Falta foto" });
    const after = await row(id);
    expect(after.status).toBe("PENDIENTE");
    expect(after.dueAt.getTime()).toBe(before.dueAt.getTime());
    expect([after.completedAt, after.metDeadline]).toEqual([null, null]);
  });

  it("los cambios de Ajustes → Plazos solo aplican a las órdenes nuevas", async () => {
    const old = await damage();
    await saveDeadlineConfig([
      { type: "DANO", deadlineHours: 48, warnFromHours: 12 },
      { type: "INSTALACION", deadlineHours: 72, warnFromHours: 24 },
      { type: "RETIRO", deadlineHours: 72, warnFromHours: 24 },
    ]);
    try {
      const fresh = await damage();
      const [o, f] = [await row(old.id), await row(fresh.id)];
      expect(o.dueAt.getTime() - o.createdAt.getTime()).toBe(72 * HOUR);
      expect(f.dueAt.getTime() - f.createdAt.getTime()).toBe(48 * HOUR);
      expect([o.warnFromHours, f.warnFromHours]).toEqual([24, 12]);
    } finally {
      await saveDeadlineConfig(
        (["DANO", "INSTALACION", "RETIRO"] as const).map((type) => ({ type, deadlineHours: 72, warnFromHours: 24 })),
      );
    }
  });
});

describe("avisos de plazo (revisión del cron y perezosa)", () => {
  it("−25 h, −49 h y −73 h: crea exactamente el aviso del umbral, sin duplicar, a técnico y admins", async () => {
    const { id } = await install();
    await take(t1, id);
    const admins = await activeAdmins();

    await age(id, 10);
    await runDeadlineCheck();
    expect(await notificationsOf(id)).toHaveLength(0); // a tiempo: nada

    await age(id, 25);
    await runDeadlineCheck();
    let list = await notificationsOf(id);
    expect(list).toHaveLength(admins + 1);
    expect(new Set(list.map((n) => n.threshold))).toEqual(new Set(["H24"]));
    expect(list.some((n) => n.userId === t1.actor.id)).toBe(true);
    expect(list[0]!.message).toMatch(/^R-\d{6} \(Instalación\) lleva 25 h abierta\. Vence el \S+ \d{1,2}\/\d{1,2}, .+\.$/);
    expect(list[0]!.message).not.toContain("..");

    // Dos veces seguidas: no se duplica nada.
    await runDeadlineCheck();
    expect(await notificationsOf(id)).toHaveLength(admins + 1);

    await age(id, 49);
    await runDeadlineCheck();
    list = await notificationsOf(id);
    expect(list.filter((n) => n.threshold === "H48")).toHaveLength(admins + 1);
    expect(list.find((n) => n.threshold === "H48")!.message).toMatch(/^R-\d{6} está por vencer: quedan 23 h\.$/);

    await age(id, 73);
    await runDeadlineCheck();
    await runDeadlineCheck();
    list = await notificationsOf(id);
    expect(list.filter((n) => n.threshold === "VENCIDO")).toHaveLength(admins + 1);
    expect(list).toHaveLength(3 * (admins + 1));
    expect(list.find((n) => n.threshold === "VENCIDO")!.message).toMatch(/^R-\d{6} venció hace 1 h\. Técnico: Carlos Prueba\.$/);

    // Historial: "Pasó a Por vencer" y "Venció", una sola vez cada uno y sin actor (Sistema).
    const events = await prisma.auditLog.findMany({ where: { reportId: id, action: { startsWith: "PLAZO_" } }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => [e.action, e.actorId])).toEqual([
      ["PLAZO_POR_VENCER", null],
      ["PLAZO_VENCIDO", null],
    ]);
  });

  it("sin técnico: solo a los administradores, con 'Sin técnico asignado'", async () => {
    const { id } = await withdrawal();
    await age(id, 30);
    await runDeadlineCheck();
    const list = await notificationsOf(id);
    expect(list).toHaveLength(await activeAdmins());
    expect(list.every((n) => n.message.endsWith("Sin técnico asignado."))).toBe(true);
  });

  it("si el cron corre tarde, solo se manda el umbral vigente (no los tres juntos)", async () => {
    const { id } = await damage();
    await age(id, 80);
    await runDeadlineCheck();
    expect(new Set((await notificationsOf(id)).map((n) => n.threshold))).toEqual(new Set(["VENCIDO"]));
  });

  it("al pasar a Realizado, Verificado o Cancelado sus avisos se marcan como leídos; luego no se crean más", async () => {
    const { id } = await damage();
    await take(t2, id);
    await age(id, 50);
    await runDeadlineCheck();
    expect((await notificationsOf(id)).every((n) => !n.read)).toBe(true);
    await complete(t2, id, []);
    expect((await notificationsOf(id)).every((n) => n.read)).toBe(true);
    await age(id, 80);
    const before = (await notificationsOf(id)).length;
    await runDeadlineCheck();
    expect(await notificationsOf(id)).toHaveLength(before); // Realizado: reloj detenido
  });

  it("campanita: cada usuario ve y marca solo los suyos", async () => {
    const { id } = await damage();
    await take(t2, id);
    await age(id, 26);
    await runDeadlineCheck();
    const mine = await getNotificationSummary({ id: t2.actor.id, role: "TECNICO" });
    const item = mine.items.find((n) => n.href === `/tecnico/reportes/${id}`)!;
    expect(item.read).toBe(false);
    expect(mine.unread).toBeGreaterThan(0);

    await markNotificationRead(t1.actor.id, item.id); // de otro usuario: no hace nada
    expect((await getNotificationSummary({ id: t2.actor.id, role: "TECNICO" })).items.find((n) => n.id === item.id)!.read).toBe(false);
    await markNotificationRead(t2.actor.id, item.id);
    expect((await getNotificationSummary({ id: t2.actor.id, role: "TECNICO" })).items.find((n) => n.id === item.id)!.read).toBe(true);
    await markAllNotificationsRead(t2.actor.id);
    expect((await getNotificationSummary({ id: t2.actor.id, role: "TECNICO" })).unread).toBe(0);
    const adminView = await getNotificationSummary({ id: admin.actor.id, role: "ADMIN" });
    expect(adminView.items.some((n) => n.href === `/admin/reportes/${id}`)).toBe(true);
  });

  it("GET /api/cron/plazos: 401 sin el secreto o con otro; con el secreto revisa", async () => {
    const prev = process.env.CRON_SECRET;
    const call = (auth?: string) => cronGET(new Request("http://localhost/api/cron/plazos", { headers: auth ? { authorization: auth } : {} }));
    try {
      delete process.env.CRON_SECRET;
      expect((await call("Bearer cualquiera")).status).toBe(401);
      process.env.CRON_SECRET = "secreto-de-prueba";
      expect((await call()).status).toBe(401);
      expect((await call("Bearer otro")).status).toBe(401);
      const ok = await call("Bearer secreto-de-prueba");
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, notifications: expect.any(Number), events: expect.any(Number) });
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
