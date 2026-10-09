import "server-only";
import type { Role } from "@/domain/types";
import { clientInfo } from "./request";
import { requireRole } from "./session";
import type { Ctx } from "./reports";

/** Autentica, exige el rol y arma el contexto (actor + IP) para los servicios. */
export async function actionContext(role: Role): Promise<Ctx & { sessionId: string }> {
  const user = await requireRole(role);
  const { ip } = await clientInfo();
  return { actor: { id: user.id, role: user.role }, ip, sessionId: user.sessionId };
}
