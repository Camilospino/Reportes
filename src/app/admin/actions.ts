"use server";

/**
 * Acciones del administrador. Cada una llama a actionContext("ADMIN"): un técnico que
 * intente invocarlas (aunque fabrique la petición a mano) es rechazado en el servidor.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminDecisionSchema,
  fieldErrors,
  reportInputSchema,
  reportUpdateSchema,
  technicianCreateSchema,
  userIdSchema,
} from "@/domain/schemas";
import type { ActionResult } from "@/domain/types";
import { actionContext } from "@/server/action-context";
import { toActionError } from "@/server/errors";
import { applyTransition, createReport, updateReport } from "@/server/reports";
import { createTechnician, resetTechnicianPassword, setTechnicianActive } from "@/server/users";

const reportFields = (fd: FormData) => ({
  street: fd.get("street"),
  neighborhood: fd.get("neighborhood"),
  referencePoint: fd.get("referencePoint") ?? undefined,
  category: fd.get("category"),
  description: fd.get("description"),
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
  const parsed = reportUpdateSchema.safeParse({ ...reportFields(fd), version: fd.get("version") });
  if (!parsed.success) return { ok: false, error: "Revise los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  const { version, ...input } = parsed.data;
  try {
    await updateReport(ctx, reportId, input, version);
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
