/**
 * Máquina de estados de los reportes. ÚNICA fuente de verdad de qué transición
 * puede hacer quién y desde qué estado. La usan el servidor (obligatorio) y la
 * interfaz (solo para mostrar u ocultar botones).
 *
 *   PENDIENTE ─TOMAR─▶ EN_PROCESO ─▶ REALIZADO ─VERIFICAR─▶ VERIFICADO
 *       ▲                 │  │        APLAZADO
 *       │                 │  └──────▶ CLIENTE_AUSENTE
 *       ├──── LIBERAR ────┘
 *       └──── RECHAZAR (desde REALIZADO) / REPROGRAMAR (desde APLAZADO o CLIENTE_AUSENTE)
 *   CANCELAR: admin, desde PENDIENTE, EN_PROCESO, APLAZADO o CLIENTE_AUSENTE.
 */
import type { ReportStatus, Role } from "./types";

export const TRANSITIONS = [
  "TOMAR",
  "LIBERAR",
  "REALIZADO",
  "APLAZADO",
  "CLIENTE_AUSENTE",
  "VERIFICAR",
  "RECHAZAR",
  "REPROGRAMAR",
  "CANCELAR",
] as const;
export type Transition = (typeof TRANSITIONS)[number];

type Rule = {
  from: readonly ReportStatus[];
  to: ReportStatus;
  role: Role;
  /** El técnico debe ser quien tiene el reporte asignado. */
  requiresOwnership: boolean;
};

export const RULES: Record<Transition, Rule> = {
  TOMAR: { from: ["PENDIENTE"], to: "EN_PROCESO", role: "TECNICO", requiresOwnership: false },
  LIBERAR: { from: ["EN_PROCESO"], to: "PENDIENTE", role: "TECNICO", requiresOwnership: true },
  REALIZADO: { from: ["EN_PROCESO"], to: "REALIZADO", role: "TECNICO", requiresOwnership: true },
  APLAZADO: { from: ["EN_PROCESO"], to: "APLAZADO", role: "TECNICO", requiresOwnership: true },
  CLIENTE_AUSENTE: { from: ["EN_PROCESO"], to: "CLIENTE_AUSENTE", role: "TECNICO", requiresOwnership: true },
  VERIFICAR: { from: ["REALIZADO"], to: "VERIFICADO", role: "ADMIN", requiresOwnership: false },
  RECHAZAR: { from: ["REALIZADO"], to: "PENDIENTE", role: "ADMIN", requiresOwnership: false },
  REPROGRAMAR: { from: ["APLAZADO", "CLIENTE_AUSENTE"], to: "PENDIENTE", role: "ADMIN", requiresOwnership: false },
  CANCELAR: {
    from: ["PENDIENTE", "EN_PROCESO", "APLAZADO", "CLIENTE_AUSENTE"],
    to: "CANCELADO",
    role: "ADMIN",
    requiresOwnership: false,
  },
};

/** Estados en los que el administrador puede editar los datos del reporte. */
export const EDITABLE_STATUSES: readonly ReportStatus[] = ["PENDIENTE", "EN_PROCESO"];

/** Estados que el técnico reporta tras visitar el sitio (esperan revisión del admin). */
export const OUTCOME_STATUSES: readonly ReportStatus[] = ["REALIZADO", "APLAZADO", "CLIENTE_AUSENTE"];

export type ReportSnapshot = { status: ReportStatus; assignedToId: string | null };
export type Actor = { id: string; role: Role };

export type TransitionCheck = { ok: true; to: ReportStatus } | { ok: false; reason: string };

export function checkTransition(transition: Transition, report: ReportSnapshot, actor: Actor): TransitionCheck {
  const rule = RULES[transition];
  if (actor.role !== rule.role) {
    return { ok: false, reason: "No tiene permiso para realizar esta acción." };
  }
  if (!rule.from.includes(report.status)) {
    return { ok: false, reason: "El reporte cambió de estado. Recargue la página e intente de nuevo." };
  }
  if (transition === "TOMAR" && report.assignedToId !== null && report.assignedToId !== actor.id) {
    return { ok: false, reason: "Este reporte está asignado a otro técnico." };
  }
  if (rule.requiresOwnership && report.assignedToId !== actor.id) {
    return { ok: false, reason: "Este reporte no está a su cargo." };
  }
  return { ok: true, to: rule.to };
}

/** Transiciones disponibles para un actor sobre un reporte (para pintar botones). */
export function availableTransitions(report: ReportSnapshot, actor: Actor): Transition[] {
  return TRANSITIONS.filter((t) => checkTransition(t, report, actor).ok);
}

/**
 * ¿Puede un técnico VER el reporte? (además de los que ya gestionó, que se validan en el servidor
 * consultando la bitácora).
 */
export function technicianCanSee(report: ReportSnapshot, technicianId: string): boolean {
  if (report.assignedToId === technicianId) return true;
  return report.status === "PENDIENTE" && report.assignedToId === null;
}
