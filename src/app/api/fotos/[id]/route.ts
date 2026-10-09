import { z } from "zod";
import { getAttachmentForViewer } from "@/server/reports";
import { getApiUser } from "@/server/session";
import { storage } from "@/server/storage";

/**
 * GET /api/fotos/:id — entrega una foto solo a usuarios autorizados.
 * El bucket es privado; la foto pasa por aquí para verificar permisos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });

  const att = await getAttachmentForViewer(id, { id: user.id, role: user.role });
  if (!att) return new Response("No encontrado", { status: 404 });

  const body = await storage().get(att.storageKey);
  if (!body) return new Response("No encontrado", { status: 404 });

  return new Response((Buffer.isBuffer(body) ? new Uint8Array(body) : body) as BodyInit, {
    headers: {
      "Content-Type": att.mimeType,
      // Las fotos nunca cambian: caché larga, pero solo en el navegador del usuario.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
