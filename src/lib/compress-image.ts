/**
 * Compresión de fotos en el navegador antes de subir:
 * redimensiona a máx. 1600 px y baja la calidad JPEG hasta quedar por debajo de ~1 MB.
 * Una foto típica de celular (4–8 MB) queda en 250–600 KB.
 */
const MAX_SIDE = 1600;
const TARGET_BYTES = 1_000_000;
const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4];

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      // imageOrientation "from-image" respeta la rotación EXIF de la cámara.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* algunos navegadores viejos fallan: se usa <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

export async function compressImage(file: File): Promise<Blob> {
  // No se confía en file.type: algunos Android lo entregan vacío o como application/octet-stream.
  // Si el archivo no es una imagen, decode() falla y se informa al usuario (el servidor también valida).
  const img = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.drawImage(img.source, 0, 0, w, h);

    let blob: Blob | null = null;
    for (const q of QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error("No se pudo comprimir la imagen.");
    return blob;
  } finally {
    img.close();
  }
}
