"use server";

import { redirect } from "next/navigation";
import { changePasswordSchema, fieldErrors, loginSchema } from "@/domain/schemas";
import type { ActionResult } from "@/domain/types";
import { writeAudit } from "@/server/audit";
import { toActionError } from "@/server/errors";
import { clientInfo } from "@/server/request";
import { createSession, destroySession, getCurrentUser, homeFor, requireUser } from "@/server/session";
import { authenticate, changeOwnPassword } from "@/server/users";

/**
 * Inicia sesión. No redirige: devuelve la ruta de inicio para que el carnet del login alcance a
 * voltearse ("Acceso válido") antes de que el navegador navegue a ella.
 */
export async function loginAction(
  _prev: ActionResult<{ target: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ target: string }>> {
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Revise los datos.", fieldErrors: fieldErrors(parsed.error) };

  let target: string;
  try {
    const meta = await clientInfo();
    const user = await authenticate(parsed.data.username, parsed.data.password, meta.ip);
    await createSession(user, meta);
    target = homeFor(user.role);
  } catch (e) {
    return toActionError(e);
  }
  return { ok: true, data: { target } };
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    const { ip } = await clientInfo();
    await writeAudit({ actorId: user.id, entity: "AUTH", action: "LOGOUT", ip });
  }
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser({ allowPasswordChange: true });
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, error: "Revise los datos.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const { ip } = await clientInfo();
    await changeOwnPassword(
      { actor: { id: user.id, role: user.role }, ip, sessionId: user.sessionId },
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
  } catch (e) {
    return toActionError(e);
  }
  redirect(`${homeFor(user.role)}?msg=clave`);
}
