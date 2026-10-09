import { NextResponse } from "next/server";
import { z } from "zod";
import { ATTACHMENT_KINDS } from "@/domain/types";
import { AppError } from "@/server/errors";
import { MAX_UPLOAD_BYTES } from "@/server/images";
import { uploadPhoto } from "@/server/reports";
import { clientInfo, isSameOrigin } from "@/server/request";
import { getApiUser } from "@/server/session";

/**
 * POST /api/reportes/:id/fotos  (multipart: file, kind)
 * Sube una foto del técnico para un reporte que tiene EN PROCESO.
 * Responde { id } para que el formulario la envíe junto con el resultado.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const user = await getApiUser("TECNICO");
  if (!user) return json({ error: "Sesión vencida o sin permiso. Vuelva a iniciar sesión." }, 401);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return json({ error: "Reporte no válido." }, 404);

  // Rechazo temprano por tamaño declarado (antes de leer el cuerpo completo).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "La foto supera 5 MB." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Envío incompleto. Reintente." }, 400);
  }
  const file = form.get("file");
  const kind = z.enum(ATTACHMENT_KINDS).safeParse(form.get("kind"));
  if (!(file instanceof Blob) || !kind.success) return json({ error: "Falta la foto." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "La foto supera 5 MB." }, 413);

  try {
    const { ip } = await clientInfo();
    const result = await uploadPhoto(
      { actor: { id: user.id, role: user.role }, ip },
      id,
      kind.data,
      Buffer.from(await file.arrayBuffer()),
    );
    return json(result, 201);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    console.error("[upload]", e);
    return json({ error: "No se pudo guardar la foto. Reintente." }, 500);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
