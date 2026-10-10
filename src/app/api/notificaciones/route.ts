import { z } from "zod";
import { maybeRunDeadlineCheck } from "@/server/deadlines";
import { getNotificationSummary, markAllNotificationsRead, markNotificationRead } from "@/server/notifications";
import { isSameOrigin } from "@/server/request";
import { getApiUser } from "@/server/session";

/** Campanita: conteo y últimos avisos del usuario. También dispara la revisión perezosa de plazos. */
export async function GET() {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  await maybeRunDeadlineCheck();
  return Response.json(await getNotificationSummary(user), { headers: { "Cache-Control": "no-store" } });
}

const bodySchema = z.union([z.object({ id: z.string().uuid() }), z.object({ all: z.literal(true) })]);

/** Marcar uno ({ id }) o todos ({ all: true }) como leídos. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await getApiUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  if ("id" in parsed.data) await markNotificationRead(user.id, parsed.data.id);
  else await markAllNotificationsRead(user.id);
  return Response.json(await getNotificationSummary(user), { headers: { "Cache-Control": "no-store" } });
}
