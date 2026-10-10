/**
 * Revisión de plazos: crea los avisos de las órdenes que cruzaron un umbral (24 h, 48 h, vencida)
 * y deja en el historial cuándo pasaron a "Por vencer" y cuándo vencieron.
 *
 * La ejecutan dos caminos con la MISMA función (así nunca se contradicen):
 * - El cron de Vercel: GET /api/cron/plazos (protegido con CRON_SECRET).
 * - La revisión "perezosa" al cargar las pantallas, como máximo cada 10 minutos (maybeRunDeadlineCheck).
 * Es idempotente: la restricción única (usuario, orden, umbral) y el requestId del historial
 * impiden duplicados aunque las dos corran a la vez.
 */
import type { DeadlineThreshold, Prisma } from "@prisma/client";
import { ORDER_TYPE_LABEL, reportCode } from "@/domain/labels";
import { formatDueDate } from "@/lib/dates";
import { PLAZO_ACTIVE_STATUSES, UMBRAL_DE_NIVEL, cortesPlazo, plazoDeOrden, plazoHoras, type NivelPlazo, type Plazo } from "@/lib/plazo";
import { prisma } from "./db";

const JOB = "plazos";
export const LAZY_INTERVAL_MS = 10 * 60_000;
const HOUR = 3_600_000;

/** Acción del historial cuando la orden cruza el umbral (el de 24 h solo avisa). */
const HISTORY_ACTION: Partial<Record<DeadlineThreshold, string>> = { H48: "PLAZO_POR_VENCER", VENCIDO: "PLAZO_VENCIDO" };

type Order = {
  id: string;
  code: number;
  type: keyof typeof ORDER_TYPE_LABEL;
  dueAt: Date;
};

/** Texto del aviso. Las horas son las reales al momento de revisar (el cron puede correr tarde). */
export function deadlineMessage(o: Order, threshold: DeadlineThreshold, p: Plazo, technician: string | null): string {
  const code = reportCode(o.code);
  const noTech = technician ? "" : " Sin técnico asignado.";
  switch (threshold) {
    case "H24":
      // La fecha ya termina en punto ("p. m."): no se agrega otro.
      return `${code} (${ORDER_TYPE_LABEL[o.type]}) lleva ${Math.floor(p.horasTranscurridas)} h abierta. Vence el ${formatDueDate(o.dueAt).replace(/\.$/, "")}.${noTech}`;
    case "H48":
      return `${code} está por vencer: quedan ${p.horasRestantes < 1 ? "menos de 1" : Math.ceil(p.horasRestantes)} h.${noTech}`;
    case "VENCIDO": {
      const late = -p.horasRestantes;
      const ago = late < 1 ? "menos de 1 h" : `${Math.floor(late)} h`;
      return `${code} venció hace ${ago}. ${technician ? `Técnico: ${technician}.` : "Sin técnico asignado."}`;
    }
  }
}

export async function runDeadlineCheck(now: Date = new Date()): Promise<{ notifications: number; events: number }> {
  const [orders, admins] = await Promise.all([
    prisma.report.findMany({
      where: { status: { in: [...PLAZO_ACTIVE_STATUSES] } },
      select: {
        id: true,
        code: true,
        type: true,
        status: true,
        createdAt: true,
        dueAt: true,
        warnFromHours: true,
        completedAt: true,
        assignedToId: true,
        assignedTo: { select: { name: true, active: true } },
      },
    }),
    prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } }),
  ]);

  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const events: Prisma.AuditLogCreateManyInput[] = [];
  for (const o of orders) {
    const p = plazoDeOrden(o, now);
    // Solo el umbral vigente: si el cron corrió tarde y la orden ya venció, no se manda también el de 24 h.
    const threshold = UMBRAL_DE_NIVEL[p.nivel as NivelPlazo] ?? null;
    if (!threshold) continue;
    const technician = o.assignedTo?.active ? o.assignedTo.name : null;
    const message = deadlineMessage(o, threshold, p, technician);
    const recipients = [...admins.map((a) => a.id), ...(technician && o.assignedToId ? [o.assignedToId] : [])];
    for (const userId of new Set(recipients)) {
      notifications.push({ userId, reportId: o.id, threshold, message, createdAt: now });
    }
    const action = HISTORY_ACTION[threshold];
    if (action) {
      const cortes = cortesPlazo(plazoHoras(o), { avisoDesdeHoras: o.warnFromHours });
      const crossedAt = new Date(o.createdAt.getTime() + (threshold === "H48" ? cortes.porVencer : cortes.vencido) * HOUR);
      // requestId fijo por orden y umbral: el evento queda UNA sola vez en el historial.
      events.push({ actorId: null, entity: "REPORT", action, reportId: o.id, requestId: `plazo:${o.id}:${threshold}`, createdAt: crossedAt });
    }
  }

  const [n, e] = await prisma.$transaction([
    prisma.notification.createMany({ data: notifications, skipDuplicates: true }),
    prisma.auditLog.createMany({ data: events, skipDuplicates: true }),
    prisma.jobRun.upsert({ where: { name: JOB }, create: { name: JOB, lastRunAt: now }, update: { lastRunAt: now } }),
  ]);
  return { notifications: n.count, events: e.count };
}

/**
 * Revisión "perezosa" desde las pantallas: corre solo si pasaron 10 minutos desde la última.
 * La reserva es atómica (un UPDATE condicionado), así dos pestañas a la vez no la repiten.
 * Nunca rompe la página: si falla, se registra y la pantalla carga igual.
 */
export async function maybeRunDeadlineCheck(now: Date = new Date()): Promise<boolean> {
  try {
    const claimed = await prisma.$executeRaw`
      INSERT INTO "job_runs" ("name", "last_run_at") VALUES (${JOB}, ${now})
      ON CONFLICT ("name") DO UPDATE SET "last_run_at" = EXCLUDED."last_run_at"
      WHERE "job_runs"."last_run_at" < ${new Date(now.getTime() - LAZY_INTERVAL_MS)}`;
    if (claimed === 0) return false;
    await runDeadlineCheck(now);
    return true;
  } catch (e) {
    console.error("[plazos]", e);
    return false;
  }
}
