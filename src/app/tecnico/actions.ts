"use server";

/** Acciones del técnico. Todas exigen rol TECNICO en el servidor. */
import { revalidatePath } from "next/cache";
import { fieldErrors, outcomeSchema, technicianSimpleSchema } from "@/domain/schemas";
import type { ActionResult } from "@/domain/types";
import { dateOnlyToUtc } from "@/lib/dates";
import { actionContext } from "@/server/action-context";
import { toActionError } from "@/server/errors";
import { applyTransition } from "@/server/reports";

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
