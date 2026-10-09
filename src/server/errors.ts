import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";

/**
 * Error de negocio con mensaje apto para mostrar al usuario.
 * Cualquier otro error se registra en el log y se muestra un mensaje genérico.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "No tiene permiso para realizar esta acción.") => new AppError(msg, 403);
export const notFound = (msg = "El registro no existe.") => new AppError(msg, 404);
export const conflict = (msg = "El reporte fue modificado por otra persona. Recargue la página e intente de nuevo.") =>
  new AppError(msg, 409);

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Convierte una excepción en el resultado de error de una Server Action. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> } {
  unstable_rethrow(e); // deja pasar redirect()/notFound() de Next
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  console.error("[error]", e);
  return { ok: false, error: "Ocurrió un error inesperado. Intente de nuevo." };
}
