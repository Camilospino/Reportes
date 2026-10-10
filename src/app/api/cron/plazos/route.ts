import { timingSafeEqual } from "node:crypto";
import { runDeadlineCheck } from "@/server/deadlines";

/**
 * Revisión de plazos programada (vercel.json → crons). Vercel envía `Authorization: Bearer <CRON_SECRET>`.
 * Sin CRON_SECRET configurado, o con otro valor, responde 401 y no hace nada.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const result = await runDeadlineCheck();
  return Response.json({ ok: true, ...result });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
