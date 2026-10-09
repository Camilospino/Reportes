"use server";

/** Acciones del técnico. Todas exigen rol TECNICO en el servidor. */
import { revalidatePath } from "next/cache";
import { completeSchema, fieldErrors, outcomeSchema, reportActionSchema, technicianSimpleSchema } from "@/domain/schemas";
import type { ActionResult } from "@/domain/types";
import { dateOnlyToUtc } from "@/lib/dates";
import { actionContext } from "@/server/action-context";
import { toActionError } from "@/server/errors";
import { applyTransition, type TransitionParams } from "@/server/reports";

/** Tomar o liberar un reporte. */
export async function technicianSimpleAction(input: unknown): Promise<ActionResult> {
  const ctx = await actionContext("TECNICO");
  const parsed = technicianSimpleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Solicitud no válida." };
  try {
    await applyTransition(ctx, parsed.data);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/tecnico", "layout");
  return { ok: true };
}

/** Registrar el resultado de la visita: Realizado, Aplazado o Cliente ausente. */
export async function submitOutcomeAction(input: unknown): Promise<ActionResult> {
  const ctx = await actionContext("TECNICO");
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise los datos.", fieldErrors: fieldErrors(parsed.error) };
  const o = parsed.data;
  try {
    switch (o.transition) {
      case "REALIZADO":
        await applyTransition(ctx, {
          ...o,
          data: o.note ? { nota: o.note } : undefined,
          attachmentIds: o.attachmentIds,
        });
        break;
      case "APLAZADO":
        await applyTransition(ctx, {
          ...o,
          data: { motivo: o.reason, ...(o.newDate ? { nuevaFecha: o.newDate } : {}) },
          rescheduledFor: o.newDate ? dateOnlyToUtc(o.newDate) : null,
        });
        break;
      case "CLIENTE_AUSENTE":
        await applyTransition(ctx, {
          ...o,
          data: { fechaIntento: o.attemptedAt },
          attachmentIds: o.attachmentIds,
        });
        break;
    }
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/tecnico", "layout");
  return { ok: true };
}

// ─── Pantalla de inicio ────────────────────────────────────────────────
// El técnico SIEMPRE sale de la sesión (actionContext); del navegador solo llegan el id del
// reporte y el id de la solicitud. Las reglas (rol, estado, dueño) se validan en applyTransition.

async function run(params: TransitionParams): Promise<ActionResult> {
  const ctx = await actionContext("TECNICO");
  try {
    await applyTransition(ctx, params);
  } catch (e) {
    return toActionError(e);
  }
  revalidateReports();
  return { ok: true };
}

/** Inicio del técnico, "Mi historial" y las pantallas del administrador. */
function revalidateReports() {
  revalidatePath("/tecnico", "layout");
  revalidatePath("/admin", "layout");
}

/** "Tomar este reporte": solo si sigue Pendiente y sin técnico (UPDATE condicionado: gana uno solo). */
export async function tomarReporte(input: unknown): Promise<ActionResult> {
  const parsed = reportActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Solicitud no válida." };
  return run({ ...parsed.data, transition: "TOMAR", scope: "disponible" });
}

/** "Iniciar trabajo": un reporte Pendiente que el admin le asignó pasa a En proceso. */
export async function iniciarReporte(input: unknown): Promise<ActionResult> {
  const parsed = reportActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Solicitud no válida." };
  return run({ ...parsed.data, transition: "TOMAR", scope: "propio" });
}

/** "Marcar realizado": solo el técnico a cargo y En proceso. Exige foto de evidencia; la nota es opcional. */
export async function marcarRealizado(input: unknown): Promise<ActionResult> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise los datos.", fieldErrors: fieldErrors(parsed.error) };
  const o = parsed.data;
  return run({
    reportId: o.reportId,
    requestId: o.requestId,
    transition: "REALIZADO",
    data: o.note ? { nota: o.note } : undefined,
    attachmentIds: o.attachmentIds,
  });
}
