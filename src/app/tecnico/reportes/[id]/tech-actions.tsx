"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/alert";
import { bogotaDateString, bogotaDateTimeLocal } from "@/lib/dates";
import { NETWORK_ERROR_MSG, newId, withRetry } from "@/lib/client-utils";
import type { ActionResult } from "@/domain/types";
import { submitOutcomeAction, technicianSimpleAction } from "../../actions";
import { PhotoPicker } from "../../photo-picker";

type Mode = "REALIZADO" | "APLAZADO" | "CLIENTE_AUSENTE";

/**
 * Panel de acciones del técnico. Flujo objetivo (< 1 minuto):
 *   Tomar → Realizado → foto (sube sola) → Enviar.
 */
export function TechActions({ reportId, canTake, isWorking }: { reportId: string; canTake: boolean; isWorking: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  // Campos de los formularios
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [attemptedAt, setAttemptedAt] = useState("");
  const [photos, setPhotos] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const onPhotos = useCallback((s: { ids: string[]; busy: boolean }) => setPhotos(s), []);
  const formRef = useRef<HTMLFormElement>(null);

  // Al elegir un resultado, llevar el formulario a la vista (en celular queda bajo el pliegue).
  useEffect(() => {
    if (mode) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode]);

  async function call(fn: () => Promise<ActionResult>, onOk: () => void) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await withRetry(fn, { attempts: 4 });
      if (res.ok) onOk();
      else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    } catch {
      setError(NETWORK_ERROR_MSG);
    } finally {
      setBusy(false);
    }
  }

  function take() {
    const id = newId();
    void call(() => technicianSimpleAction({ transition: "TOMAR", reportId, requestId: id }), () => router.refresh());
  }

  function release() {
    if (!window.confirm("¿Liberar el reporte? Volverá a la lista de disponibles.")) return;
    const id = newId();
    void call(
      () => technicianSimpleAction({ transition: "LIBERAR", reportId, requestId: id }),
      () => router.push("/tecnico?msg=liberado"),
    );
  }

  function open(m: Mode) {
    setMode(m);
    setRequestId(newId()); // mismo id en todos los reintentos de este envío
    setError(null);
    setFieldErrors({});
    setPhotos({ ids: [], busy: false });
    if (m === "CLIENTE_AUSENTE") setAttemptedAt(bogotaDateTimeLocal());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    const payload =
      mode === "REALIZADO"
        ? { transition: mode, reportId, requestId, note, attachmentIds: photos.ids }
        : mode === "APLAZADO"
          ? { transition: mode, reportId, requestId, reason, newDate }
          : { transition: mode, reportId, requestId, attemptedAt, attachmentIds: photos.ids };
    void call(() => submitOutcomeAction(payload), () => router.push("/tecnico?msg=enviado"));
  }

  if (canTake) {
    return (
      <section className="card space-y-3">
        {error ? <Alert kind="error">{error}</Alert> : null}
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={take}>
          {busy ? "Tomando…" : "Tomar reporte"}
        </button>
        <p className="text-center text-sm text-slate-600">Al tomarlo, queda a su cargo y desaparece para los demás.</p>
      </section>
    );
  }

  if (!isWorking) return null;

  if (!mode) {
    return (
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">¿Cuál fue el resultado de la visita?</h2>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <button type="button" className="btn btn-success btn-lg" onClick={() => open("REALIZADO")}>
          ✅ Realizado
        </button>
        <button type="button" className="btn btn-warning btn-lg" onClick={() => open("APLAZADO")}>
          ⏸ Aplazado
        </button>
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => open("CLIENTE_AUSENTE")}>
          🚪 Cliente ausente
        </button>
        <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={release}>
          Liberar reporte (no puedo atenderlo)
        </button>
      </section>
    );
  }

  const photosMissing = mode === "REALIZADO" && photos.ids.length === 0;
  const submitDisabled =
    busy || photos.busy || photosMissing || (mode === "APLAZADO" && reason.trim().length === 0) || (mode === "CLIENTE_AUSENTE" && !attemptedAt);

  return (
    <form ref={formRef} onSubmit={submit} className="card scroll-mt-28 space-y-4" noValidate>
      <h2 className="text-lg font-bold">
        {mode === "REALIZADO" ? "✅ Realizado" : mode === "APLAZADO" ? "⏸ Aplazado" : "🚪 Cliente ausente"}
      </h2>

      {mode === "REALIZADO" ? (
        <>
          <PhotoPicker reportId={reportId} kind="EVIDENCIA" max={10} label="Fotos de evidencia * (mínimo 1)" onChange={onPhotos} />
          {fieldErrors.attachmentIds ? <p className="field-error">{fieldErrors.attachmentIds[0]}</p> : null}
          <div>
            <label htmlFor="note" className="label">
              Nota (opcional)
            </label>
            <textarea id="note" className="input min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </>
      ) : null}

      {mode === "APLAZADO" ? (
        <>
          <div>
            <label htmlFor="reason" className="label">
              Motivo *
            </label>
            <textarea
              id="reason"
              className="input min-h-24"
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: Falta material, el cliente pidió otra fecha…"
              aria-invalid={!!fieldErrors.reason}
            />
            {fieldErrors.reason ? <p className="field-error">{fieldErrors.reason[0]}</p> : null}
          </div>
          <div>
            <label htmlFor="newDate" className="label">
              Nueva fecha estimada (opcional)
            </label>
            <input id="newDate" type="date" className="input" min={bogotaDateString()} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            {fieldErrors.newDate ? <p className="field-error">{fieldErrors.newDate[0]}</p> : null}
          </div>
        </>
      ) : null}

      {mode === "CLIENTE_AUSENTE" ? (
        <>
          <div>
            <label htmlFor="attemptedAt" className="label">
              Fecha y hora del intento *
            </label>
            <input
              id="attemptedAt"
              type="datetime-local"
              className="input"
              required
              max={bogotaDateTimeLocal()}
              value={attemptedAt}
              onChange={(e) => setAttemptedAt(e.target.value)}
            />
            {fieldErrors.attemptedAt ? <p className="field-error">{fieldErrors.attemptedAt[0]}</p> : null}
          </div>
          <PhotoPicker reportId={reportId} kind="FACHADA" max={5} label="Foto de la fachada (opcional)" onChange={onPhotos} />
        </>
      ) : null}

      {error ? <Alert kind="error">{error}</Alert> : null}
      {photosMissing && !photos.busy ? (
        <p className="text-sm font-medium text-amber-800">Tome al menos una foto para poder enviar.</p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-lg" disabled={submitDisabled}>
        {busy ? "Enviando…" : photos.busy ? "Esperando fotos…" : "Enviar"}
      </button>
      <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => setMode(null)}>
        Volver
      </button>
    </form>
  );
}
