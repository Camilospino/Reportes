"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentKind } from "@/domain/types";
import { compressImage } from "@/lib/compress-image";
import { PermanentError, withRetry } from "@/lib/client-utils";

type Item = {
  key: string;
  preview: string;
  status: "procesando" | "subiendo" | "lista" | "error";
  attempt: number;
  attachmentId?: string;
  error?: string;
  blob?: Blob;
};

/**
 * Selector de fotos para campo:
 * - Abre la cámara trasera directamente (capture="environment"); también permite galería.
 * - Comprime en el celular (≤ ~1 MB) y SUBE DE INMEDIATO en segundo plano, con reintentos,
 *   para que al tocar "Enviar" las fotos ya estén arriba.
 * - Informa al padre los ids de las fotos listas y si hay subidas en curso.
 */
export function PhotoPicker({
  reportId,
  kind,
  max,
  label,
  onChange,
}: {
  reportId: string;
  kind: AttachmentKind;
  max: number;
  label: string;
  onChange: (state: { ids: string[]; busy: boolean }) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    onChange({
      ids: items.filter((i) => i.status === "lista" && i.attachmentId).map((i) => i.attachmentId!),
      busy: items.some((i) => i.status === "procesando" || i.status === "subiendo"),
    });
  }, [items, onChange]);

  // Libera las vistas previas al salir.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function upload(key: string, blob: Blob) {
    update(key, { status: "subiendo", attempt: 1, error: undefined, blob });
    try {
      const id = await withRetry(
        async () => {
          const fd = new FormData();
          fd.append("file", blob, "foto.jpg");
          fd.append("kind", kind);
          const res = await fetch(`/api/reportes/${reportId}/fotos`, { method: "POST", body: fd });
          const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
          if (res.ok && body.id) return body.id;
          // 4xx = error definitivo (no se reintenta), salvo 408/429. 5xx = reintentar.
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            throw new PermanentError(body.error ?? "No se pudo subir la foto.");
          }
          throw new Error(body.error ?? `Error ${res.status}`);
        },
        { attempts: 5, onRetry: (n) => update(key, { attempt: n + 1 }) },
      );
      update(key, { status: "lista", attachmentId: id, blob: undefined });
    } catch (e) {
      update(key, {
        status: "error",
        error: e instanceof PermanentError ? e.message : "No se pudo subir (señal débil). Toque Reintentar.",
      });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const room = max - itemsRef.current.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = `${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      setItems((prev) => [...prev, { key, preview, status: "procesando", attempt: 0 }]);
      try {
        const blob = await compressImage(file);
        void upload(key, blob);
      } catch {
        update(key, { status: "error", error: "No se pudo leer el archivo como foto. Tómela de nuevo." });
      }
    }
  }

  function remove(key: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.key !== key);
    });
  }

  const full = items.length >= max;

  return (
    <div className="space-y-3">
      <p className="label">{label}</p>
      {items.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((i) => (
            <li key={i.key} className="relative overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={i.preview} alt="Foto seleccionada" className="aspect-square w-full object-cover" />
              <div
                className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-xs font-bold ${
                  i.status === "lista"
                    ? "bg-green-700 text-white"
                    : i.status === "error"
                      ? "bg-red-700 text-white"
                      : "bg-slate-800/80 text-white"
                }`}
              >
                {i.status === "procesando" && "Procesando…"}
                {i.status === "subiendo" && (i.attempt > 1 ? `Reintento ${i.attempt}/5…` : "Subiendo…")}
                {i.status === "lista" && "✓ Lista"}
                {i.status === "error" && "Error"}
              </div>
              {i.status !== "procesando" && i.status !== "subiendo" ? (
                <button
                  type="button"
                  onClick={() => remove(i.key)}
                  aria-label="Quitar foto"
                  className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-slate-800 shadow"
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {items
        .filter((i) => i.status === "error")
        .map((i) => (
          <div key={i.key} className="flex items-center gap-2 text-sm text-red-800">
            <span className="flex-1">{i.error}</span>
            {i.blob ? (
              <button type="button" className="btn btn-secondary min-h-10 px-3 text-sm" onClick={() => upload(i.key, i.blob!)}>
                Reintentar
              </button>
            ) : null}
          </div>
        ))}

      {!full ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => cameraRef.current?.click()}>
            📷 {items.length ? "Tomar otra foto" : "Tomar foto"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => galleryRef.current?.click()}>
            Elegir de la galería
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Máximo {max} fotos.</p>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid={`camera-${kind}`}
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
