/**
 * Datos de DEMOSTRACIÓN: 1 administrador, 2 técnicos y 10 reportes en todos los estados,
 * con historial y fotos de ejemplo.
 *
 *   npm run db:seed
 *
 * Usuarios: admin / tecnico1 / tecnico2, contraseña = SEED_PASSWORD (por defecto "Cambiar.2026").
 * En producción NO se ejecuta (salvo ALLOW_DEMO_SEED=1). Para producción use `npm run admin:create`.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, type AttachmentKind, type Prisma, type ReportStatus } from "@prisma/client";
import sharp from "sharp";
import { SERVICE_CITY as CITY } from "../src/domain/location";
import { buildSearchText } from "../src/domain/text";
import { hashPassword } from "../src/server/password";
import { storage } from "../src/server/storage";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "Cambiar.2026";
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("El seed de demostración no se ejecuta en producción. Use `npm run admin:create`.");
  }
  if (await prisma.user.findUnique({ where: { username: "admin" } })) {
    console.log("Ya existen datos semilla (usuario 'admin'). Para reiniciar: npm run db:reset");
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({
    data: { name: "Ana Martínez", username: "admin", role: "ADMIN", passwordHash, phone: "3001112233" },
  });
  const t1 = await prisma.user.create({
    data: { name: "Carlos Pérez", username: "tecnico1", role: "TECNICO", passwordHash, phone: "3104445566" },
  });
  const t2 = await prisma.user.create({
    data: { name: "Laura Gómez", username: "tecnico2", role: "TECNICO", passwordHash, phone: "3157778899" },
  });

  type Event = {
    at: number; // horas atrás
    actor: string;
    action: string;
    from?: ReportStatus;
    to?: ReportStatus;
    data?: Prisma.InputJsonValue;
    comment?: string;
    photos?: { kind: AttachmentKind; label: string; color: string }[];
  };

  async function report(
    base: Omit<Prisma.ReportUncheckedCreateInput, "searchText" | "createdById" | "createdAt">,
    createdHoursAgo: number,
    events: Event[],
  ) {
    const r = await prisma.report.create({
      data: {
        ...base,
        searchText: buildSearchText(base),
        createdById: admin.id,
        createdAt: ago(createdHoursAgo),
        version: events.length,
        closedAt: base.status === "VERIFICADO" || base.status === "CANCELADO" ? ago(events.at(-1)?.at ?? 0) : null,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: admin.id, entity: "REPORT", action: "CREAR", reportId: r.id, toStatus: "PENDIENTE", createdAt: ago(createdHoursAgo) },
    });
    for (const e of events) {
      const log = await prisma.auditLog.create({
        data: {
          actorId: e.actor,
          entity: "REPORT",
          action: e.action,
          reportId: r.id,
          fromStatus: e.from,
          toStatus: e.to,
          data: e.data,
          comment: e.comment,
          requestId: randomUUID(),
          createdAt: ago(e.at),
        },
      });
      for (const p of e.photos ?? []) await photo(r.id, log.id, e.actor, p.kind, p.label, p.color, ago(e.at));
    }
    return r;
  }

  /** Genera una foto de ejemplo (JPEG) y la guarda en el almacenamiento configurado. */
  async function photo(reportId: string, auditLogId: bigint, uploadedById: string, kind: AttachmentKind, label: string, color: string, createdAt: Date) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <rect width="100%" height="100%" fill="${color}"/>
      <text x="50%" y="48%" font-size="72" font-family="sans-serif" fill="#fff" text-anchor="middle">${label}</text>
      <text x="50%" y="60%" font-size="40" font-family="sans-serif" fill="#fff" text-anchor="middle">Foto de ejemplo</text>
    </svg>`;
    const data = await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toBuffer();
    const id = randomUUID();
    const storageKey = `reportes/${reportId}/${id}.jpg`;
    await storage().put(storageKey, data, "image/jpeg");
    await prisma.attachment.create({
      data: { id, reportId, auditLogId, uploadedById, kind, storageKey, mimeType: "image/jpeg", sizeBytes: data.length, width: 1200, height: 900, createdAt },
    });
  }

  const inTwoDays = bogotaLocal(new Date(Date.now() + 48 * HOUR)).slice(0, 10);
  const client = (n: string, p: string) => ({ clientName: n, clientPhone: p, contractNumber: `CTG-${p.slice(-6)}` });

  // 1–3: pendientes
  await report(
    { street: "Carrera 2 # 9-145", neighborhood: "Bocagrande", city: CITY, referencePoint: "Frente a la panadería La Espiga", category: "SIN_SERVICIO", priority: "ALTA", description: "Sin internet desde anoche. La luz LOS del ONT está en rojo.", status: "PENDIENTE", ...client("Jorge Ramírez", "3201234567") },
    3,
    [],
  );
  await report(
    { street: "Calle 31 # 80-25 apto 302", neighborhood: "El Recreo", city: CITY, referencePoint: "Conjunto Torres del Parque, torre 2", category: "LENTITUD", priority: "MEDIA", description: "El internet se cae varias veces al día y la velocidad no pasa de 5 Mbps (plan de 200 Mbps).", status: "PENDIENTE", ...client("Marcela Torres", "3112223344") },
    20,
    [],
  );
  await report(
    { street: "Diagonal 30 # 54-10", neighborhood: "Los Alpes", city: CITY, category: "WIFI", priority: "BAJA", description: "No llega señal Wi-Fi a las habitaciones del segundo piso.", status: "PENDIENTE", assignedToId: t1.id, ...client("Hernán Castillo", "3009876543") },
    26,
    [],
  );
  // 4: en proceso
  await report(
    { street: "Calle 30 # 17-22", neighborhood: "Pie de la Popa", city: CITY, referencePoint: "Casa esquinera de dos pisos, rejas verdes", category: "FIBRA_CABLEADO", priority: "ALTA", description: "Un camión reventó la acometida de fibra; el cable cuelga del poste.", status: "EN_PROCESO", assignedToId: t1.id, ...client("Rosa Beltrán", "3145556677") },
    30,
    [{ at: 1, actor: t1.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" }],
  );
  // 5: realizado, esperando verificación
  await report(
    { street: "Carrera 3 # 8-100", neighborhood: "Castillogrande", city: CITY, category: "EQUIPO", priority: "MEDIA", description: "El router no enciende después de un apagón.", status: "REALIZADO", assignedToId: t2.id, ...client("Felipe Ochoa", "3187654321") },
    48,
    [
      { at: 30, actor: t2.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" },
      { at: 28, actor: t2.id, action: "REALIZADO", from: "EN_PROCESO", to: "REALIZADO", data: { nota: "Se cambió el router por uno nuevo y se configuró el Wi-Fi." }, photos: [{ kind: "EVIDENCIA", label: "Router nuevo", color: "#166534" }, { kind: "EVIDENCIA", label: "Prueba de velocidad", color: "#1e40af" }] },
    ],
  );
  // 6: aplazado
  await report(
    { street: "Calle 70 # 40-20", neighborhood: "Olaya Herrera", city: CITY, category: "FIBRA_CABLEADO", priority: "MEDIA", description: "Fibra partida dentro de la casa por una remodelación; hay que tender cable nuevo.", status: "APLAZADO", assignedToId: t1.id, rescheduledFor: new Date(`${inTwoDays}T00:00:00Z`), ...client("Gloria Restrepo", "3016665544") },
    72,
    [
      { at: 50, actor: t1.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" },
      { at: 47, actor: t1.id, action: "APLAZADO", from: "EN_PROCESO", to: "APLAZADO", data: { motivo: "No hay rollo de fibra drop en bodega; llega el jueves.", nuevaFecha: inTwoDays } },
    ],
  );
  // 7: cliente ausente
  await report(
    { street: "Avenida Pedro de Heredia # 23-45", neighborhood: "Torices", city: CITY, referencePoint: "Al lado del restaurante El Paisa", category: "EQUIPO", priority: "BAJA", description: "Cliente solicita reubicar el router a la sala.", status: "CLIENTE_AUSENTE", assignedToId: t2.id, ...client("Iván Lozano", "3129998877") },
    80,
    [
      { at: 8, actor: t2.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" },
      { at: 6, actor: t2.id, action: "CLIENTE_AUSENTE", from: "EN_PROCESO", to: "CLIENTE_AUSENTE", data: { fechaIntento: bogotaLocal(ago(6)) }, photos: [{ kind: "FACHADA", label: "Fachada", color: "#9a3412" }] },
    ],
  );
  // 8: verificado
  await report(
    { street: "Calle del Cuartel # 36-07", neighborhood: "Centro Histórico", city: CITY, category: "SIN_SERVICIO", priority: "ALTA", description: "Local comercial sin internet; no puede recibir pagos con datáfono.", status: "VERIFICADO", assignedToId: t1.id, ...client("Patricia Mejía", "3051237890") },
    120,
    [
      { at: 100, actor: t1.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" },
      { at: 98, actor: t1.id, action: "REALIZADO", from: "EN_PROCESO", to: "REALIZADO", photos: [{ kind: "EVIDENCIA", label: "ONT en verde", color: "#0f766e" }] },
      { at: 90, actor: admin.id, action: "VERIFICAR", from: "REALIZADO", to: "VERIFICADO", comment: "Cliente confirmó por teléfono." },
    ],
  );
  // 9: cancelado
  await report(
    { street: "Transversal 54 # 60-12", neighborhood: "Crespo", city: CITY, category: "OTRO", priority: "BAJA", description: "Cliente pide revisar el cableado del televisor.", status: "CANCELADO", ...client("Daniel Suárez", "3174443322") },
    150,
    [{ at: 140, actor: admin.id, action: "CANCELAR", from: "PENDIENTE", to: "CANCELADO", comment: "El cliente llamó a cancelar: ya no lo necesita." }],
  );
  // 10: rechazado y devuelto a pendiente con el mismo técnico
  await report(
    { street: "Carrera 10 # 41-60", neighborhood: "Getsemaní", city: CITY, category: "LENTITUD", priority: "ALTA", description: "Pérdida de paquetes y latencia alta; el cliente trabaja desde casa.", status: "PENDIENTE", assignedToId: t2.id, ...client("Sofía Herrera", "3162221100") },
    60,
    [
      { at: 40, actor: t2.id, action: "TOMAR", from: "PENDIENTE", to: "EN_PROCESO" },
      { at: 38, actor: t2.id, action: "REALIZADO", from: "EN_PROCESO", to: "REALIZADO", photos: [{ kind: "EVIDENCIA", label: "Prueba de velocidad", color: "#6b21a8" }] },
      { at: 30, actor: admin.id, action: "RECHAZAR", from: "REALIZADO", to: "PENDIENTE", comment: "Falta la foto de la prueba de velocidad con cable. Por favor volver a medir." },
    ],
  );

  console.log("✔ Datos semilla creados.");
  console.log(`  Usuarios: admin, tecnico1, tecnico2 — contraseña: ${PASSWORD}`);
}

/** "YYYY-MM-DDTHH:mm" en hora de Bogotá (UTC-5). */
function bogotaLocal(d: Date) {
  return new Date(d.getTime() - 5 * HOUR).toISOString().slice(0, 16);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
