/**
 * Servicio de reportes: TODA modificación de reportes pasa por aquí.
 * Las Server Actions solo autentican, validan la entrada y delegan en estas funciones.
 */
import { randomUUID } from "node:crypto";
import type { AttachmentKind, OrderType, Prisma, ReportStatus } from "@prisma/client";
import { EDITABLE_STATUSES, checkTransition, technicianCanSee, type Transition } from "@/domain/report-state";
import { ORDER_TYPES, PRIORITIES, REPORT_STATUSES, type Role } from "@/domain/types";
import { orderTypeFromSlug } from "@/domain/labels";
import type { EquipmentClosingInput, EquipmentInput, ReportInput, ReportSort } from "@/domain/schemas";
import { buildSearchText, normalizeForSearch } from "@/domain/text";
import { bogotaDateString, bogotaDayStart, bogotaNextDayStart, dateOnlyToUtc } from "@/lib/dates";
import { PLAZO_ACTIVE_STATUSES, plazoDeOrden, type NivelPlazo } from "@/lib/plazo";
import { prisma } from "./db";
import { writeAudit } from "./audit";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "./errors";
import { processPhoto } from "./images";
import { storage } from "./storage";

export type Ctx = { actor: { id: string; role: Role }; ip: string | null };

export const PAGE_SIZE = 20;

// ─── Crear / editar ────────────────────────────────────────────────────

async function assertActiveTechnician(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!u || u.role !== "TECNICO" || !u.active) {
    throw new AppError("El técnico seleccionado no existe o está inactivo.", 400, {
      assignedToId: ["Seleccione un técnico activo."],
    });
  }
}

/** Columnas comunes a los tres tipos. */
function commonColumns(input: ReportInput) {
  return {
    street: input.street,
    neighborhood: input.neighborhood,
    city: input.city,
    referencePoint: input.referencePoint ?? null,
    priority: input.priority,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    contractNumber: input.contractNumber,
    assignedToId: input.assignedToId,
  };
}

/** Columnas propias de cada tipo; las de los otros tipos quedan en NULL. */
function typeColumns(input: ReportInput) {
  const none = { category: null, plan: null, suggestedDate: null, withdrawalReason: null, withdrawalReasonOther: null };
  switch (input.type) {
    case "DANO":
      return { ...none, category: input.category, description: input.description };
    case "INSTALACION":
      return {
        ...none,
        description: input.description ?? "",
        plan: input.plan,
        suggestedDate: input.suggestedDate ? dateOnlyToUtc(input.suggestedDate) : null,
      };
    case "RETIRO":
      return {
        ...none,
        description: input.description ?? "",
        withdrawalReason: input.withdrawalReason,
        withdrawalReasonOther: input.withdrawalReason === "OTRO" ? (input.withdrawalReasonOther ?? null) : null,
      };
  }
}

const equipmentOf = (input: ReportInput): EquipmentInput[] => (input.type === "DANO" ? [] : input.equipment);
const EQUIPMENT_ACTION_FOR = { DANO: null, INSTALACION: "INSTALAR", RETIRO: "RETIRAR" } as const;

/** Plazo vigente del tipo (Ajustes → Plazos). Sin fila: 72 h y aviso desde las 24 h. */
export async function getDeadlineConfig(type: OrderType, tx: Prisma.TransactionClient = prisma) {
  const row = await tx.deadlineConfig.findUnique({ where: { type } });
  return { deadlineHours: row?.deadlineHours ?? 72, warnFromHours: row?.warnFromHours ?? 24 };
}

export async function createReport(ctx: Ctx, input: ReportInput): Promise<{ id: string }> {
  if (input.assignedToId) await assertActiveTechnician(input.assignedToId);
  const action = EQUIPMENT_ACTION_FOR[input.type];
  return prisma.$transaction(async (tx) => {
    const config = await getDeadlineConfig(input.type, tx);
    const createdAt = new Date();
    const report = await tx.report.create({
      data: {
        ...commonColumns(input),
        ...typeColumns(input),
        type: input.type,
        searchText: buildSearchText(input),
        createdById: ctx.actor.id,
        createdAt,
        // Plazo en horas corridas desde la creación; los cambios de configuración no afectan a las ya creadas.
        dueAt: new Date(createdAt.getTime() + config.deadlineHours * 3_600_000),
        warnFromHours: config.warnFromHours,
        equipment: action
          ? { create: equipmentOf(input).map((e) => ({ kind: e.kind, serial: e.serial ?? null, action })) }
          : undefined,
      },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: ctx.actor.id,
        entity: "REPORT",
        action: "CREAR",
        reportId: report.id,
        toStatus: "PENDIENTE",
        data: { tipo: input.type },
        ip: ctx.ip,
      },
      tx,
    );
    return report;
  });
}

const EDITABLE_FIELDS = [
  "street",
  "neighborhood",
  "city",
  "referencePoint",
  "category",
  "description",
  "plan",
  "suggestedDate",
  "withdrawalReason",
  "withdrawalReasonOther",
  "priority",
  "clientName",
  "clientPhone",
  "contractNumber",
  "assignedToId",
] as const;

/** Valor comparable y legible para la bitácora (las fechas como AAAA-MM-DD). */
function plain(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

const equipmentText = (list: { kind: string; serial: string | null | undefined }[]) =>
  list.map((e) => (e.serial ? `${e.kind} (${e.serial})` : e.kind)).join(", ") || null;

export async function updateReport(ctx: Ctx, reportId: string, input: ReportInput, version: number): Promise<void> {
  const current = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      assignedTo: { select: { name: true } },
      equipment: { select: { id: true, kind: true, serial: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!current) throw notFound("El reporte no existe.");
  if (!EDITABLE_STATUSES.includes(current.status)) {
    throw new AppError("Solo se pueden editar reportes pendientes o en proceso.");
  }
  if (current.version !== version) throw conflict();
  if (input.type !== current.type) throw new AppError("El tipo de orden no se puede cambiar.");
  if (current.status === "EN_PROCESO" && input.assignedToId !== current.assignedToId) {
    throw new AppError("No se puede cambiar el técnico mientras el reporte está en proceso.", 400, {
      assignedToId: ["El técnico ya tomó el reporte."],
    });
  }
  if (input.assignedToId && input.assignedToId !== current.assignedToId) {
    await assertActiveTechnician(input.assignedToId);
  }

  const next = { ...commonColumns(input), ...typeColumns(input) };
  // Diferencias campo por campo para la bitácora (el técnico se guarda por nombre, legible).
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const field of EDITABLE_FIELDS) {
    const before = plain(current[field]);
    const after = plain(next[field]);
    if (before !== after) changes[field] = { from: before, to: after };
  }
  // Equipos: se conservan los que siguen (por id, con sus datos de cierre), se agregan y se quitan.
  const wanted = equipmentOf(input);
  const ids = new Set(current.equipment.map((e) => e.id));
  if (wanted.some((e) => e.id && !ids.has(e.id))) throw new AppError("Algún equipo no pertenece a esta orden. Recargue la página.");
  const equipmentBefore = equipmentText(current.equipment);
  const equipmentAfter = equipmentText(wanted.map((e) => ({ kind: e.kind, serial: e.serial ?? null })));
  if (equipmentBefore !== equipmentAfter) changes.equipment = { from: equipmentBefore, to: equipmentAfter };

  if (Object.keys(changes).length === 0) return;
  if (changes.assignedToId) {
    const to = input.assignedToId
      ? (await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { name: true } }))?.name ?? null
      : null;
    changes.assignedToId = { from: current.assignedTo?.name ?? null, to };
  }

  const action = EQUIPMENT_ACTION_FOR[current.type];
  await prisma.$transaction(async (tx) => {
    const res = await tx.report.updateMany({
      where: { id: reportId, version, status: current.status },
      data: { ...next, searchText: buildSearchText(input), version: { increment: 1 } },
    });
    if (res.count !== 1) throw conflict();
    if (action && changes.equipment) {
      const keep = wanted.flatMap((e) => (e.id ? [e.id] : []));
      await tx.reportEquipment.deleteMany({ where: { reportId, id: { notIn: keep } } });
      for (const e of wanted) {
        if (e.id) await tx.reportEquipment.update({ where: { id: e.id }, data: { kind: e.kind, serial: e.serial ?? null } });
        else await tx.reportEquipment.create({ data: { reportId, kind: e.kind, serial: e.serial ?? null, action } });
      }
    }
    await writeAudit(
      { actorId: ctx.actor.id, entity: "REPORT", action: "EDITAR", reportId, data: { changes }, ip: ctx.ip },
      tx,
    );
  });
}

/**
 * Asigna (o quita) el técnico sin editar el resto del reporte. Mismas reglas que updateReport:
 * solo con el reporte Pendiente (en proceso ya lo tomó un técnico), técnico activo y control de
 * versión. Queda en la bitácora como una edición del campo "Técnico asignado".
 */
export async function assignTechnician(
  ctx: Ctx,
  reportId: string,
  assignedToId: string | null,
  version: number,
): Promise<{ version: number }> {
  if (ctx.actor.role !== "ADMIN") throw forbidden();
  const current = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, version: true, assignedToId: true, assignedTo: { select: { name: true } } },
  });
  if (!current) throw notFound("El reporte no existe.");
  if (current.version !== version) throw conflict();
  if (current.status !== "PENDIENTE") {
    throw new AppError(
      current.status === "EN_PROCESO"
        ? "No se puede cambiar el técnico mientras el reporte está en proceso."
        : "Solo se puede asignar técnico a reportes pendientes.",
    );
  }
  if (assignedToId === current.assignedToId) return { version };
  let toName: string | null = null;
  if (assignedToId) {
    await assertActiveTechnician(assignedToId);
    toName = (await prisma.user.findUnique({ where: { id: assignedToId }, select: { name: true } }))?.name ?? null;
  }

  return prisma.$transaction(async (tx) => {
    const res = await tx.report.updateMany({
      where: { id: reportId, version, status: "PENDIENTE" },
      data: { assignedToId, version: { increment: 1 } },
    });
    if (res.count !== 1) throw conflict();
    await writeAudit(
      {
        actorId: ctx.actor.id,
        entity: "REPORT",
        action: "EDITAR",
        reportId,
        data: { changes: { assignedToId: { from: current.assignedTo?.name ?? null, to: toName } } },
        ip: ctx.ip,
      },
      tx,
    );
    return { version: version + 1 };
  });
}

// ─── Cambios de estado ─────────────────────────────────────────────────

export type TransitionParams = {
  reportId: string;
  transition: Transition;
  /** Identificador único generado por el cliente: un reintento no duplica el cambio. */
  requestId: string;
  comment?: string | null;
  /** Datos propios del resultado (motivo, nota, fecha del intento, nueva fecha). */
  data?: Record<string, string>;
  attachmentIds?: string[];
  /** REALIZADO de instalaciones y retiros: cierre de cada equipo. */
  equipment?: EquipmentClosingInput[];
  rescheduledFor?: Date | null;
  /**
   * Restricción extra de TOMAR según desde dónde se pide:
   * - "disponible": "Tomar" en Disponibles; solo si sigue sin técnico.
   * - "propio": "Iniciar trabajo" de un reporte que el admin le asignó.
   */
  scope?: "disponible" | "propio";
  /** Estados desde los que se permite en este punto de la interfaz (más estricto que la máquina de estados). */
  onlyFrom?: readonly ReportStatus[];
};

export const TAKEN_BY_OTHER_MSG = "Otro técnico ya tomó este reporte.";

const ATTACHMENT_KIND_FOR: Partial<Record<Transition, AttachmentKind>> = {
  REALIZADO: "EVIDENCIA",
  CLIENTE_AUSENTE: "FACHADA",
};

export async function applyTransition(ctx: Ctx, p: TransitionParams): Promise<void> {
  // Idempotencia: si ya se aplicó esta misma solicitud (reintento por mala señal), no hacer nada.
  const prior = await prisma.auditLog.findUnique({
    where: { requestId: p.requestId },
    select: { reportId: true, actorId: true },
  });
  if (prior) {
    if (prior.reportId === p.reportId && prior.actorId === ctx.actor.id) return;
    throw new AppError("Solicitud no válida. Recargue la página.");
  }

  const report = await prisma.report.findUnique({
    where: { id: p.reportId },
    select: {
      status: true,
      assignedToId: true,
      version: true,
      type: true,
      dueAt: true,
      equipment: { select: { id: true, kind: true, serial: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) throw notFound("El reporte no existe.");

  if (p.scope === "disponible" && (report.status !== "PENDIENTE" || report.assignedToId !== null)) {
    throw conflict(TAKEN_BY_OTHER_MSG);
  }
  if (p.scope === "propio" && report.assignedToId !== ctx.actor.id) {
    throw forbidden("Este reporte no está a su cargo.");
  }
  if (p.onlyFrom && !p.onlyFrom.includes(report.status)) throw conflict();

  const check = checkTransition(p.transition, report, ctx.actor);
  if (!check.ok) throw new AppError(check.reason, 409);

  const attachmentIds = [...new Set(p.attachmentIds ?? [])];
  // Regla crítica (también validada en el navegador y en Zod): REALIZADO exige foto.
  if (p.transition === "REALIZADO" && attachmentIds.length === 0) {
    throw new AppError("Debe subir al menos una foto como evidencia.", 400, {
      attachmentIds: ["Debe subir al menos una foto como evidencia."],
    });
  }
  const expectedKind = ATTACHMENT_KIND_FOR[p.transition];
  if (attachmentIds.length > 0 && !expectedKind) throw new AppError("Esta acción no admite fotos.");
  // Regla crítica: una instalación no se cierra sin seriales ni un retiro sin marcar cada equipo.
  const closing = p.transition === "REALIZADO" ? validateEquipmentClosing(report.type, report.equipment, p.equipment ?? []) : [];
  if (p.transition !== "REALIZADO" && p.equipment?.length) throw new AppError("Esta acción no admite datos de equipos.");

  const assignedToId =
    p.transition === "TOMAR" ? ctx.actor.id : p.transition === "LIBERAR" ? null : report.assignedToId;
  const to = check.to;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Actualización condicionada: si otro usuario cambió el reporte entre la lectura
      // y este punto (p. ej. dos técnicos tocan "Tomar" a la vez), no se actualiza nada.
      const res = await tx.report.updateMany({
        where: { id: p.reportId, status: report.status, assignedToId: report.assignedToId, version: report.version },
        data: {
          status: to,
          assignedToId,
          version: { increment: 1 },
          closedAt: to === "VERIFICADO" || to === "CANCELADO" ? now : null,
          // Inicio: al pasar a En proceso; se borra si vuelve a Pendiente (liberar, rechazar, reprogramar).
          startedAt: to === "EN_PROCESO" ? now : to === "PENDIENTE" ? null : undefined,
          // Cierre del técnico: al marcar Realizado; se conserva al verificar y se borra si se reabre.
          // El plazo (dueAt) nunca cambia: si el admin la devuelve, el reloj sigue donde iba.
          completedAt: to === "REALIZADO" ? now : to === "VERIFICADO" ? undefined : null,
          metDeadline: to === "REALIZADO" ? now <= report.dueAt : to === "VERIFICADO" ? undefined : null,
          ...(p.transition === "APLAZADO" ? { rescheduledFor: p.rescheduledFor ?? null } : {}),
        },
      });
      if (res.count !== 1) {
        throw conflict(
          p.transition === "TOMAR" && report.assignedToId === null
            ? TAKEN_BY_OTHER_MSG
            : "El reporte cambió de estado. Recargue la página e intente de nuevo.",
        );
      }

      const log = await writeAudit(
        {
          actorId: ctx.actor.id,
          entity: "REPORT",
          action: p.transition,
          reportId: p.reportId,
          fromStatus: report.status,
          toStatus: to,
          data: auditData(p.data, closing),
          comment: p.comment ?? null,
          ip: ctx.ip,
          requestId: p.requestId,
        },
        tx,
      );

      for (const c of closing) {
        await tx.reportEquipment.update({
          where: { id: c.id },
          data: { serial: c.serial, received: c.received, condition: c.condition, observation: c.observation },
        });
      }
      // Al cerrarse (o cancelarse) la orden, sus avisos pendientes dejan de serlo.
      if (to === "REALIZADO" || to === "VERIFICADO" || to === "CANCELADO") {
        await tx.notification.updateMany({ where: { reportId: p.reportId, read: false }, data: { read: true } });
      }

      if (attachmentIds.length > 0) {
        const linked = await tx.attachment.updateMany({
          where: {
            id: { in: attachmentIds },
            reportId: p.reportId,
            uploadedById: ctx.actor.id,
            auditLogId: null,
            kind: expectedKind,
          },
          data: { auditLogId: log.id },
        });
        if (linked.count !== attachmentIds.length) {
          throw new AppError("Alguna de las fotos no es válida. Elimínela y vuelva a subirla.");
        }
      }
    });
  } catch (e) {
    // Dos reintentos simultáneos con el mismo requestId: el segundo choca con el índice único.
    if (isUniqueViolation(e)) return;
    throw e;
  }
}

type ClosingRow = {
  id: string;
  kind: string;
  serial: string | null;
  received: boolean | null;
  condition: "BUENO" | "DANADO" | "INCOMPLETO" | null;
  observation: string | null;
};

const CLOSING_ERROR = (msg: string) => new AppError(msg, 400, { equipment: [msg] });

/**
 * Valida el cierre de equipos contra los equipos REALES de la orden:
 * - Daño: no lleva equipos.
 * - Instalación: cada equipo con serial (el que ya tenía o el que escribe el técnico).
 * - Retiro: cada equipo marcado como recibido o no; si se recibió, con su estado.
 */
export function validateEquipmentClosing(
  type: OrderType,
  equipment: { id: string; kind: string; serial: string | null }[],
  input: EquipmentClosingInput[],
): ClosingRow[] {
  if (type === "DANO") {
    if (input.length) throw CLOSING_ERROR("Esta orden no tiene equipos.");
    return [];
  }
  const byId = new Map(input.map((e) => [e.id, e]));
  if (byId.size !== input.length || input.some((e) => !equipment.some((x) => x.id === e.id))) {
    throw CLOSING_ERROR("La lista de equipos cambió. Recargue la página.");
  }
  return equipment.map((e) => {
    const c = byId.get(e.id);
    const serial = c?.serial ?? e.serial ?? null;
    if (type === "INSTALACION") {
      if (!serial) throw CLOSING_ERROR("Escriba el serial de cada equipo instalado.");
      return { id: e.id, kind: e.kind, serial, received: null, condition: null, observation: c?.observation ?? null };
    }
    if (typeof c?.received !== "boolean") throw CLOSING_ERROR("Marque si recibió cada equipo.");
    if (c.received && !c.condition) throw CLOSING_ERROR("Indique el estado de cada equipo recibido.");
    return {
      id: e.id,
      kind: e.kind,
      serial,
      received: c.received,
      condition: c.received ? c.condition! : null,
      observation: c.observation ?? null,
    };
  });
}

/** Datos del evento para el historial, con el cierre de equipos si lo hay. */
function auditData(data: Record<string, string> | undefined, closing: ClosingRow[]): Prisma.InputJsonValue | undefined {
  const base: Record<string, Prisma.InputJsonValue> = { ...data };
  if (closing.length) {
    base.equipos = closing.map((c) => ({
      tipo: c.kind,
      serial: c.serial,
      recibido: c.received,
      estado: c.condition,
      observacion: c.observation,
    }));
  }
  return Object.keys(base).length > 0 ? base : undefined;
}

// ─── Fotos ─────────────────────────────────────────────────────────────

const MAX_PENDING_UPLOADS = 20;

/**
 * Guarda una foto del técnico para el reporte que tiene EN PROCESO. Queda "pendiente"
 * (sin evento) hasta que el técnico envía el resultado; ahí se vincula al evento.
 */
export async function uploadPhoto(
  ctx: Ctx,
  reportId: string,
  kind: AttachmentKind,
  file: Buffer,
): Promise<{ id: string }> {
  if (ctx.actor.role !== "TECNICO") throw forbidden();
  const report = await prisma.report.findUnique({ where: { id: reportId }, select: { status: true, assignedToId: true } });
  if (!report) throw notFound("El reporte no existe.");
  if (report.status !== "EN_PROCESO" || report.assignedToId !== ctx.actor.id) {
    throw forbidden("Solo puede subir fotos de un reporte que tenga en proceso.");
  }
  const pending = await prisma.attachment.count({
    where: { reportId, uploadedById: ctx.actor.id, auditLogId: null },
  });
  if (pending >= MAX_PENDING_UPLOADS) throw new AppError("Demasiadas fotos sin enviar en este reporte.", 429);

  const photo = await processPhoto(file);
  const id = randomUUID();
  const storageKey = `reportes/${reportId}/${id}.jpg`;
  await storage().put(storageKey, photo.data, "image/jpeg");
  await prisma.attachment.create({
    data: {
      id,
      reportId,
      uploadedById: ctx.actor.id,
      kind,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: photo.data.length,
      width: photo.width,
      height: photo.height,
    },
  });
  return { id };
}

/** Foto si el usuario puede verla; null en caso contrario (la API responde 404 en ambos casos). */
export async function getAttachmentForViewer(attachmentId: string, viewer: Ctx["actor"]) {
  const att = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { storageKey: true, mimeType: true, uploadedById: true, reportId: true },
  });
  if (!att) return null;
  if (viewer.role === "ADMIN" || att.uploadedById === viewer.id) return att;
  return (await technicianCanAccessReport(att.reportId, viewer.id)) ? att : null;
}

// ─── Consultas ─────────────────────────────────────────────────────────

/** El técnico puede ver un reporte si está disponible, asignado a él o si ya trabajó en él. */
export async function technicianCanAccessReport(reportId: string, technicianId: string): Promise<boolean> {
  const report = await prisma.report.findUnique({ where: { id: reportId }, select: { status: true, assignedToId: true } });
  if (!report) return false;
  if (technicianCanSee(report, technicianId)) return true;
  const worked = await prisma.auditLog.findFirst({
    where: { reportId, actorId: technicianId },
    select: { id: true },
  });
  return worked !== null;
}

export type AdminFilters = {
  estado?: string;
  prioridad?: string;
  tecnico?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  tipo?: string;
  plazo?: NivelPlazo;
  orden?: ReportSort;
  page: number;
};

const isStatus = (v: unknown): v is ReportStatus => REPORT_STATUSES.includes(v as ReportStatus);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "R-000012", "000012" o "12" → 12 (para buscar por código). */
function codeFromQuery(q: string): number | null {
  const m = /^(?:r-?)?0*(\d{1,9})$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}

type WhereOpts = { ignoreStatus?: boolean; ignoreType?: boolean; plazoIds?: string[] };

/**
 * Filtros del listado. Las opciones `ignore*` sirven para los conteos de las tarjetas y pestañas
 * (respetan todos los demás filtros). `plazoIds`: órdenes del nivel de plazo elegido.
 */
function adminWhere(f: Omit<AdminFilters, "page">, opts: WhereOpts = {}): Prisma.ReportWhereInput {
  const where: Prisma.ReportWhereInput = {};
  if (!opts.ignoreStatus && isStatus(f.estado)) where.status = f.estado;
  const type = orderTypeFromSlug(f.tipo);
  if (!opts.ignoreType && type) where.type = type;
  if (opts.plazoIds) where.id = { in: opts.plazoIds };
  if (PRIORITIES.includes(f.prioridad as never)) where.priority = f.prioridad as (typeof PRIORITIES)[number];
  if (f.tecnico === "sin") where.assignedToId = null;
  else if (f.tecnico && UUID_RE.test(f.tecnico)) where.assignedToId = f.tecnico;
  if (f.desde || f.hasta) {
    where.createdAt = {
      ...(f.desde ? { gte: bogotaDayStart(f.desde) } : {}),
      ...(f.hasta ? { lt: bogotaNextDayStart(f.hasta) } : {}),
    };
  }
  const q = f.q ? normalizeForSearch(f.q) : "";
  if (q) {
    const code = codeFromQuery(q);
    where.OR = [{ searchText: { contains: q } }, ...(code !== null ? [{ code }] : [])];
  }
  return where;
}

// Los cerrados (Verificado/Cancelado, con closedAt) van al final; lo activo, por vencimiento.
const ACTIVE_FIRST: Prisma.ReportOrderByWithRelationInput = { closedAt: { sort: "desc", nulls: "first" } };

const SORT_ORDER: Record<ReportSort, Prisma.ReportOrderByWithRelationInput[]> = {
  "vence-asc": [ACTIVE_FIRST, { dueAt: "asc" }, { code: "asc" }],
  "vence-desc": [ACTIVE_FIRST, { dueAt: "desc" }, { code: "desc" }],
  "creado-desc": [{ createdAt: "desc" }],
  "creado-asc": [{ createdAt: "asc" }],
  "codigo-desc": [{ code: "desc" }],
  "codigo-asc": [{ code: "asc" }],
  // El enum está ordenado ALTA, MEDIA, BAJA: "desc" (más urgente primero) es orden ascendente del enum.
  "prioridad-desc": [{ priority: "asc" }, { createdAt: "desc" }],
  "prioridad-asc": [{ priority: "desc" }, { createdAt: "desc" }],
};

/** Campos que necesitan las etiquetas de tipo y de plazo. */
const orderSelect = {
  type: true,
  category: true,
  plan: true,
  withdrawalReason: true,
  withdrawalReasonOther: true,
  createdAt: true,
  dueAt: true,
  warnFromHours: true,
  completedAt: true,
} satisfies Prisma.ReportSelect;

/** Órdenes con el reloj corriendo (lo mínimo para calcular su nivel de plazo). */
function activeOrders(where: Prisma.ReportWhereInput = {}) {
  return prisma.report.findMany({
    where: { AND: [where, { status: { in: [...PLAZO_ACTIVE_STATUSES] } }] },
    select: { id: true, status: true, createdAt: true, dueAt: true, warnFromHours: true, completedAt: true, assignedToId: true },
  });
}

const emptyLevels = (): Record<NivelPlazo, number> => ({ "a-tiempo": 0, atencion: 0, "por-vencer": 0, vencido: 0 });

/**
 * Lista del administrador con todo lo que pinta la página: filas, total y conteos por estado,
 * tipo y nivel de plazo (cada conteo respeta los demás filtros).
 */
export async function listReportsForAdmin(f: AdminFilters) {
  const now = new Date();
  // El nivel de plazo depende de la hora actual: se calcula con calcularPlazo sobre las órdenes activas.
  const active = await activeOrders(adminWhere(f));
  const levelCounts = emptyLevels();
  const idsByLevel: Record<NivelPlazo, string[]> = { "a-tiempo": [], atencion: [], "por-vencer": [], vencido: [] };
  for (const r of active) {
    const { nivel } = plazoDeOrden(r, now);
    if (nivel in levelCounts) {
      levelCounts[nivel as NivelPlazo] += 1;
      idsByLevel[nivel as NivelPlazo].push(r.id);
    }
  }
  const plazoIds = f.plazo ? idsByLevel[f.plazo] : undefined;
  const where = adminWhere(f, { plazoIds });

  const [items, total, statusRows, typeRows] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: SORT_ORDER[f.orden ?? "vence-asc"],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        ...orderSelect,
        id: true,
        code: true,
        street: true,
        neighborhood: true,
        city: true,
        priority: true,
        status: true,
        assignedToId: true,
        version: true,
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.report.count({ where }),
    prisma.report.groupBy({
      by: ["status"],
      where: adminWhere(f, { ignoreStatus: true, plazoIds }),
      orderBy: { status: "asc" },
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ["type"],
      where: adminWhere(f, { ignoreType: true, plazoIds }),
      orderBy: { type: "asc" },
      _count: { _all: true },
    }),
  ]);
  const statusCounts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const r of statusRows) statusCounts[r.status] = (r._count as { _all: number })._all;
  const typeCounts = Object.fromEntries(ORDER_TYPES.map((t) => [t, 0])) as Record<OrderType, number>;
  for (const r of typeRows) typeCounts[r.type] = (r._count as { _all: number })._all;
  return {
    items,
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    statusCounts,
    typeCounts,
    levelCounts,
  };
}

/**
 * Conteo por estado y tipo en UN solo groupBy (cabecera del Panel): el navegador suma según el
 * filtro de tipo elegido, sin volver a consultar.
 */
export async function countByStatusAndType(): Promise<{ status: ReportStatus; type: OrderType; count: number }[]> {
  const rows = await prisma.report.groupBy({ by: ["status", "type"], _count: { _all: true } });
  return rows.map((r) => ({ status: r.status, type: r.type, count: r._count._all }));
}

/** % de órdenes cerradas a tiempo en los últimos 30 días, por tipo (según metDeadline). */
export async function deadlineCompliance(now = new Date()) {
  const rows = await prisma.report.groupBy({
    by: ["type", "metDeadline"],
    where: { completedAt: { gte: new Date(now.getTime() - 30 * 24 * 3_600_000) }, metDeadline: { not: null } },
    _count: { _all: true },
  });
  return ORDER_TYPES.map((type) => {
    const of = rows.filter((r) => r.type === type);
    const total = of.reduce((n, r) => n + r._count._all, 0);
    const onTime = of.filter((r) => r.metDeadline).reduce((n, r) => n + r._count._all, 0);
    return { type, total, onTime, percent: total ? Math.round((onTime / total) * 100) : null };
  });
}

const listSelect = {
  ...orderSelect,
  id: true,
  code: true,
  street: true,
  neighborhood: true,
  city: true,
  priority: true,
  status: true,
  updatedAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.ReportSelect;

const equipmentSelect = {
  id: true,
  kind: true,
  serial: true,
  action: true,
  received: true,
  condition: true,
  observation: true,
} satisfies Prisma.ReportEquipmentSelect;

/**
 * Órdenes de los carriles del Panel: las activas (el reloj corre) y las Realizadas (por verificar).
 * El carril de cada una lo decide calcularPlazo en el navegador, con la hora actual.
 */
export function listPanelOrders() {
  return prisma.report.findMany({
    where: { status: { in: [...PLAZO_ACTIVE_STATUSES, "REALIZADO"] } },
    orderBy: { code: "asc" },
    select: {
      ...orderSelect,
      id: true,
      code: true,
      street: true,
      neighborhood: true,
      city: true,
      status: true,
      version: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
      equipment: { select: { received: true } },
    },
  });
}

/** Vista principal del técnico: sus reportes activos + los disponibles (paginados), por vencimiento. */
export async function listForTechnician(technicianId: string, page: number) {
  const today = bogotaDateString();
  const availableWhere: Prisma.ReportWhereInput = { status: "PENDIENTE", assignedToId: null };
  const [mine, available, availableTotal, doneToday] = await prisma.$transaction([
    prisma.report.findMany({
      where: { assignedToId: technicianId, status: { in: ["EN_PROCESO", "PENDIENTE"] } },
      // Lo que vence primero va arriba.
      orderBy: [{ dueAt: "asc" }, { priority: "asc" }, { code: "asc" }],
      // El teléfono y los equipos solo van en los suyos ("Llamar" y el cierre).
      select: { ...listSelect, clientPhone: true, equipment: { select: equipmentSelect, orderBy: { createdAt: "asc" } } },
    }),
    prisma.report.findMany({
      where: availableWhere,
      orderBy: [{ dueAt: "asc" }, { priority: "asc" }, { code: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: listSelect,
    }),
    prisma.report.count({ where: availableWhere }),
    // "Hechos hoy": fecha de cierre del técnico dentro de hoy en Bogotá (00:00 a 23:59:59.999).
    prisma.report.count({
      where: { assignedToId: technicianId, completedAt: { gte: bogotaDayStart(today), lt: bogotaNextDayStart(today) } },
    }),
  ]);
  return {
    mine,
    available,
    page,
    pageCount: Math.max(1, Math.ceil(availableTotal / PAGE_SIZE)),
    availableTotal,
    doneToday,
  };
}

/** Detalle completo con historial, equipos y fotos (las fotos pendientes de envío no se muestran). */
export function getReportDetail(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      assignedTo: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
      equipment: { select: equipmentSelect, orderBy: { createdAt: "asc" } },
      auditLog: {
        orderBy: { createdAt: "asc" },
        include: {
          actor: { select: { name: true, role: true } },
          attachments: { select: { id: true, kind: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}
export type ReportDetail = NonNullable<Awaited<ReturnType<typeof getReportDetail>>>;

export async function technicianHistory(technicianId: string, page: number) {
  const where: Prisma.AuditLogWhereInput = {
    actorId: technicianId,
    action: { in: ["REALIZADO", "APLAZADO", "CLIENTE_AUSENTE"] },
  };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        createdAt: true,
        report: { select: { id: true, code: true, type: true, street: true, neighborhood: true, city: true, status: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
