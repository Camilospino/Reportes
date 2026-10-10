"use server";

/**
 * Acciones del administrador. Cada una llama a actionContext("ADMIN"): un técnico que
 * intente invocarlas (aunque fabrique la petición a mano) es rechazado en el servidor.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminDecisionSchema,
  assignTechnicianSchema,
  deadlineConfigSchema,
  panelDecisionSchema,
  fieldErrors,
  reportEditSchema,
  reportInputSchema,
  technicianCreateSchema,
  userIdSchema,
  versionSchema,
} from "@/domain/schemas";
import type { ActionResult } from "@/domain/types";
import { actionContext } from "@/server/action-context";
import { AppError, toActionError } from "@/server/errors";
import { saveDeadlineConfig } from "@/server/deadline-config";
import { applyTransition, assignTechnician, createReport, updateReport, type TransitionParams } from "@/server/reports";
import { createTechnician, resetTechnicianPassword, setTechnicianActive } from "@/server/users";

/** Equipos: llegan como JSON en un campo oculto (lista que el formulario arma y edita). */
function equipmentField(fd: FormData): unknown {
  const raw = fd.get("equipment");
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Campos del formulario; los de otros tipos se ignoran al validar (Zod descarta lo que sobra). */
const reportFields = (fd: FormData) => ({
  type: fd.get("type") ?? undefined,
  street: fd.get("street"),
  neighborhood: fd.get("neighborhood"),
  referencePoint: fd.get("referencePoint") ?? undefined,
  category: fd.get("category") ?? undefined,
  description: fd.get("description") ?? undefined,
  plan: fd.get("plan") ?? undefined,
  suggestedDate: fd.get("suggestedDate") ?? undefined,
  withdrawalReason: fd.get("withdrawalReason") ?? undefined,
  withdrawalReasonOther: fd.get("withdrawalReasonOther") ?? undefined,
  equipment: equipmentField(fd),
  priority: fd.get("priority"),
  clientName: fd.get("clientName"),
  clientPhone: fd.get("clientPhone"),
  contractNumber: fd.get("contractNumber"),
  assignedToId: fd.get("assignedToId") ?? undefined,
});

export async function createReportAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = reportInputSchema.safeParse(reportFields(fd));
  if (!parsed.success) return { ok: false, error: "Revise los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  let id: string;
  try {
    id = (await createReport(ctx, parsed.data)).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/reportes/${id}?msg=creado`);
}

export async function updateReportAction(
  reportId: string,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = reportEditSchema.safeParse(reportFields(fd));
  const version = versionSchema.safeParse(fd.get("version"));
  if (!parsed.success) return { ok: false, error: "Revise los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  if (!version.success) return { ok: false, error: "Recargue la página e intente de nuevo." };
  try {
    await updateReport(ctx, reportId, parsed.data, version.data);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/reportes/${reportId}?msg=editado`);
}

/** Verificar, rechazar, reprogramar o cancelar. */
export async function adminDecisionAction(input: unknown): Promise<ActionResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = adminDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise los datos.", fieldErrors: fieldErrors(parsed.error) };
  try {
    await applyTransition(ctx, parsed.data);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Asignar o quitar el técnico desde el panel lateral de la lista. Devuelve la nueva versión. */
export async function assignTechnicianAction(input: unknown): Promise<ActionResult<{ version: number }>> {
  const ctx = await actionContext("ADMIN");
  const parsed = assignTechnicianSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos. Recargue la página." };
  try {
    const data = await assignTechnician(ctx, parsed.data.reportId, parsed.data.assignedToId, parsed.data.version);
    revalidatePath("/admin", "layout");
    revalidatePath("/tecnico", "layout"); // la orden aparece (o sale) de las listas de los técnicos
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

// ─── Ajustes → Plazos ──────────────────────────────────────────────────

/** Guarda el plazo y el aviso de cada tipo. Solo afecta a las órdenes que se creen después. */
export async function saveDeadlineConfigAction(input: unknown): Promise<ActionResult> {
  await actionContext("ADMIN");
  const parsed = deadlineConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise los valores." };
  try {
    await saveDeadlineConfig(parsed.data);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

// ─── Técnicos ──────────────────────────────────────────────────────────

export type TempPasswordResult = ActionResult<{ username: string; tempPassword: string }>;

export async function createTechnicianAction(_prev: TempPasswordResult | null, fd: FormData): Promise<TempPasswordResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = technicianCreateSchema.safeParse({
    name: fd.get("name"),
    username: fd.get("username"),
    phone: fd.get("phone") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Revise los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const data = await createTechnician(ctx, parsed.data);
    revalidatePath("/admin/usuarios");
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setTechnicianActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) return { ok: false, error: "Usuario no válido." };
  try {
    await setTechnicianActive(ctx, parsed.data.userId, active === true);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function resetTechnicianPasswordAction(userId: string): Promise<TempPasswordResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) return { ok: false, error: "Usuario no válido." };
  try {
    const data = await resetTechnicianPassword(ctx, parsed.data.userId);
    revalidatePath("/admin/usuarios");
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

// ─── Panel de prioridades ──────────────────────────────────────────────
// Cada acción vuelve a exigir el rol ADMIN, valida con Zod y delega en applyTransition, que hace
// la actualización condicionada (estado + versión) y escribe el historial en la misma transacción.
// Devolver y reprogramar conservan el técnico asignado.

const ALREADY_REVIEWED_MSG = "Este reporte ya fue revisado por otra persona. Se actualizó la bandeja.";

async function panelDecision(
  input: unknown,
  transition: TransitionParams["transition"],
  onlyFrom: TransitionParams["onlyFrom"],
): Promise<ActionResult> {
  const ctx = await actionContext("ADMIN");
  const parsed = panelDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { id, requestId, nota } = parsed.data;
  try {
    await applyTransition(ctx, { reportId: id, transition, requestId, comment: nota ?? null, onlyFrom });
  } catch (e) {
    // 409: el reporte ya no está en el estado esperado (otra pestaña u otro administrador).
    if (e instanceof AppError && e.status === 409) return { ok: false, error: ALREADY_REVIEWED_MSG };
    return toActionError(e);
  }
  revalidatePath("/admin", "layout"); // Panel y lista de reportes
  revalidatePath("/tecnico", "layout"); // el reporte vuelve (o sale) de las listas del técnico
  return { ok: true };
}

/** Realizado → Verificado. */
export async function verificarReporte(input: unknown): Promise<ActionResult> {
  return panelDecision(input, "VERIFICAR", ["REALIZADO"]);
}

/** Realizado → Pendiente, con el mismo técnico. */
export async function devolverReporte(input: unknown): Promise<ActionResult> {
  return panelDecision(input, "RECHAZAR", ["REALIZADO"]);
}

/** Aplazado o Cliente ausente → Pendiente, con el mismo técnico. */
export async function reprogramarReporte(input: unknown): Promise<ActionResult> {
  return panelDecision(input, "REPROGRAMAR", ["APLAZADO", "CLIENTE_AUSENTE"]);
}

/** Pendiente, En proceso, Aplazado o Cliente ausente → Cancelado (los estados que permite la máquina de estados). */
export async function cancelarReporte(input: unknown): Promise<ActionResult> {
  return panelDecision(input, "CANCELAR", ["PENDIENTE", "EN_PROCESO", "APLAZADO", "CLIENTE_AUSENTE"]);
}
