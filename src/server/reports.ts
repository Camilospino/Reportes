/**
 * Servicio de reportes: TODA modificación de reportes pasa por aquí.
 * Las Server Actions solo autentican, validan la entrada y delegan en estas funciones.
 */
import { randomUUID } from "node:crypto";
import type { AttachmentKind, Prisma, ReportStatus } from "@prisma/client";
import { EDITABLE_STATUSES, checkTransition, technicianCanSee, type Transition } from "@/domain/report-state";
import { PRIORITIES, REPORT_STATUSES, type Role } from "@/domain/types";
import type { ReportInput, ReportSort } from "@/domain/schemas";
import { buildSearchText, normalizeForSearch } from "@/domain/text";
import { bogotaDateString, bogotaDayStart, bogotaNextDayStart } from "@/lib/dates";
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

export async function createReport(ctx: Ctx, input: ReportInput): Promise<{ id: string }> {
  if (input.assignedToId) await assertActiveTechnician(input.assignedToId);
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.create({
      data: {
        ...input,
        referencePoint: input.referencePoint ?? null,
        searchText: buildSearchText(input),
        createdById: ctx.actor.id,
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
  "priority",
  "clientName",
  "clientPhone",
  "contractNumber",
  "assignedToId",
] as const;

export async function updateReport(ctx: Ctx, reportId: string, input: ReportInput, version: number): Promise<void> {
  const current = await prisma.report.findUnique({
    where: { id: reportId },
    include: { assignedTo: { select: { name: true } } },
  });
  if (!current) throw notFound("El reporte no existe.");
  if (!EDITABLE_STATUSES.includes(current.status)) {
    throw new AppError("Solo se pueden editar reportes pendientes o en proceso.");
  }
  if (current.version !== version) throw conflict();
  if (current.status === "EN_PROCESO" && input.assignedToId !== current.assignedToId) {
    throw new AppError("No se puede cambiar el técnico mientras el reporte está en proceso.", 400, {
      assignedToId: ["El técnico ya tomó el reporte."],
    });
  }
  if (input.assignedToId && input.assignedToId !== current.assignedToId) {
    await assertActiveTechnician(input.assignedToId);
  }

  // Diferencias campo por campo para la bitácora (el técnico se guarda por nombre, legible).
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const field of EDITABLE_FIELDS) {
    const before = (current[field] ?? null) as string | null;
    const after = (input[field] ?? null) as string | null;
    if (before !== after) changes[field] = { from: before, to: after };
  }
  if (Object.keys(changes).length === 0) return;
  if (changes.assignedToId) {
    const to = input.assignedToId
      ? (await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { name: true } }))?.name ?? null
      : null;
    changes.assignedToId = { from: current.assignedTo?.name ?? null, to };
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.report.updateMany({
      where: { id: reportId, version, status: current.status },
      data: {
        ...input,
        referencePoint: input.referencePoint ?? null,
        searchText: buildSearchText(input),
        version: { increment: 1 },
      },
    });
    if (res.count !== 1) throw conflict();
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
    select: { status: true, assignedToId: true, version: true },
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

  const assignedToId =
    p.transition === "TOMAR" ? ctx.actor.id : p.transition === "LIBERAR" ? null : report.assignedToId;
  const to = check.to;

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
          closedAt: to === "VERIFICADO" || to === "CANCELADO" ? new Date() : null,
          // Inicio: al pasar a En proceso; se borra si vuelve a Pendiente (liberar, rechazar, reprogramar).
          startedAt: to === "EN_PROCESO" ? new Date() : to === "PENDIENTE" ? null : undefined,
          // Cierre del técnico: al marcar Realizado; se conserva al verificar y se borra si se reabre.
          completedAt: to === "REALIZADO" ? new Date() : to === "VERIFICADO" ? undefined : null,
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
          data: p.data && Object.keys(p.data).length > 0 ? p.data : undefined,
          comment: p.comment ?? null,
          ip: ctx.ip,
          requestId: p.requestId,
        },
        tx,
      );

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

/** Filtros del listado. `ignoreStatus` sirve para los conteos por estado (respetan todo lo demás). */
function adminWhere(f: Omit<AdminFilters, "page">, ignoreStatus = false): Prisma.ReportWhereInput {
  const where: Prisma.ReportWhereInput = {};
  if (!ignoreStatus && isStatus(f.estado)) where.status = f.estado;
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

const SORT_ORDER: Record<ReportSort, Prisma.ReportOrderByWithRelationInput[]> = {
  "creado-desc": [{ createdAt: "desc" }],
  "creado-asc": [{ createdAt: "asc" }],
  "codigo-desc": [{ code: "desc" }],
  "codigo-asc": [{ code: "asc" }],
  // El enum está ordenado ALTA, MEDIA, BAJA: "desc" (más urgente primero) es orden ascendente del enum.
  "prioridad-desc": [{ priority: "asc" }, { createdAt: "desc" }],
  "prioridad-asc": [{ priority: "desc" }, { createdAt: "desc" }],
};

export async function listReportsForAdmin(f: AdminFilters) {
  const where = adminWhere(f);
  const [items, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: SORT_ORDER[f.orden ?? "creado-desc"],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        street: true,
        neighborhood: true,
        city: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        assignedToId: true,
        version: true,
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);
  return { items, total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Conteo por estado con los filtros actuales, salvo el de estado (para las tarjetas del listado). */
export async function countByStatusForAdmin(f: Omit<AdminFilters, "page">): Promise<Record<ReportStatus, number>> {
  const rows = await prisma.report.groupBy({ by: ["status"], where: adminWhere(f, true), _count: { _all: true } });
  const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const r of rows) counts[r.status] = r._count._all;
  return counts;
}

export async function countByStatus(): Promise<Record<ReportStatus, number>> {
  const rows = await prisma.report.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const r of rows) counts[r.status] = r._count._all;
  return counts;
}

const listSelect = {
  id: true,
  code: true,
  street: true,
  neighborhood: true,
  city: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.ReportSelect;

/** Reportes que esperan revisión del administrador (más antiguos primero). */
export function listAwaitingReview(limit = 10) {
  return prisma.report.findMany({
    where: { status: { in: ["REALIZADO", "APLAZADO", "CLIENTE_AUSENTE"] } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: listSelect,
  });
}

/** Estados que esperan una decisión del administrador (bandeja del Panel). */
export const REVIEW_STATUSES = ["REALIZADO", "APLAZADO", "CLIENTE_AUSENTE"] as const satisfies readonly ReportStatus[];

/** Bandeja del Panel: reportes por revisar, del cambio más reciente al más antiguo. */
export function listReviewInbox() {
  return prisma.report.findMany({
    where: { status: { in: [...REVIEW_STATUSES] } },
    orderBy: [{ updatedAt: "desc" }, { code: "desc" }],
    select: {
      id: true,
      code: true,
      street: true,
      neighborhood: true,
      city: true,
      category: true,
      priority: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      clientName: true,
      clientPhone: true,
      assignedTo: { select: { name: true } },
    },
  });
}

/** Historial de todos los reportes de la bandeja en UNA consulta (sin N+1); lo más antiguo primero. */
export function listReviewInboxHistory() {
  return prisma.auditLog.findMany({
    where: { entity: "REPORT", report: { status: { in: [...REVIEW_STATUSES] } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reportId: true,
      action: true,
      toStatus: true,
      comment: true,
      data: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });
}

/** Vista principal del técnico: sus reportes activos + los disponibles (paginados). */
export async function listForTechnician(technicianId: string, page: number) {
  const today = bogotaDateString();
  const availableWhere: Prisma.ReportWhereInput = { status: "PENDIENTE", assignedToId: null };
  const [mine, available, availableTotal, doneToday] = await prisma.$transaction([
    prisma.report.findMany({
      where: { assignedToId: technicianId, status: { in: ["EN_PROCESO", "PENDIENTE"] } },
      // EN_PROCESO va primero: es lo que el técnico tiene entre manos.
      orderBy: [{ status: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
      // El teléfono solo va en los suyos (botón "Llamar"); los disponibles no lo necesitan.
      select: { ...listSelect, clientPhone: true },
    }),
    prisma.report.findMany({
      where: availableWhere,
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
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

/** Detalle completo con historial y fotos (las fotos pendientes de envío no se muestran). */
export function getReportDetail(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      assignedTo: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
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
        report: { select: { id: true, code: true, street: true, neighborhood: true, city: true, status: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
