import sharp, { type Metadata } from "sharp";
import { AppError } from "./errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // el cliente ya comprime a ~1 MB; 5 MB es margen
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_SIDE = 1600;

/**
 * Valida y re-codifica una foto subida:
 * - El tipo se detecta por el CONTENIDO (no por la extensión ni el Content-Type enviado).
 * - Se re-codifica a JPEG: elimina cualquier contenido incrustado y los metadatos EXIF/GPS.
 * - Se corrige la orientación y se limita a 1600 px por lado.
 */
export async function processPhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) {
    throw new AppError("La foto supera el tamaño máximo de 5 MB.", 413);
  }
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new AppError("El archivo no es una imagen válida.", 415);
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new AppError("Formato no permitido. Use una foto JPG, PNG o WEBP.", 415);
  }
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
