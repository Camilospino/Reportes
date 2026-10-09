"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/alert";
import { STATUS_LABEL } from "@/domain/labels";
import type { Transition } from "@/domain/report-state";
import type { ReportStatus } from "@/domain/types";
import { NETWORK_ERROR_MSG, newId, withRetry } from "@/lib/client-utils";
import { adminDecisionAction } from "../../actions";

type AdminTransition = "VERIFICAR" | "RECHAZAR" | "REPROGRAMAR" | "CANCELAR";

const CONFIG: Record<AdminTransition, { label: string; className: string; prompt: string; requiresComment: boolean }> = {
  VERIFICAR: {
    label: "✔ Verificar cierre",
    className: "btn btn-success",
    prompt: "Confirma que revisó la evidencia y el trabajo quedó bien hecho.",
    requiresComment: false,
  },
  RECHAZAR: {
    label: "✖ Rechazar cierre",
    className: "btn btn-danger",
    prompt: "El reporte volverá a Pendiente (con el mismo técnico). Explique qué falta.",
    requiresComment: true,
  },
  REPROGRAMAR: {
    label: "↻ Reprogramar",
    className: "btn btn-primary",
    prompt: "El reporte volverá a Pendiente para una nueva visita. Agregue instrucciones.",
    requiresComment: true,
  },
  CANCELAR: {
    label: "Cancelar reporte",
    className: "btn btn-secondary",
    prompt: "El reporte quedará cancelado de forma definitiva. Indique el motivo.",
    requiresComment: true,
  },
};

export function AdminDecisionPanel({
  reportId,
  status,
  transitions,
}: {
  reportId: string;
  status: ReportStatus;
  transitions: Transition[];
}) {
  const router = useRouter();
  const options = transitions.filter((t): t is AdminTransition => t in CONFIG);
  const [selected, setSelected] = useState<AdminTransition | null>(null);
  const [requestId, setRequestId] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(t: AdminTransition) {
    setSelected(t);
    setRequestId(newId()); // un id por decisión: los reintentos no la duplican
    setComment("");
    setError(null);
  }

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await withRetry(() =>
        adminDecisionAction({ transition: selected, reportId, requestId, comment }),
      );
      if (!res.ok) {
        setError(res.fieldErrors?.comment?.[0] ?? res.error);
        return;
      }
      setSelected(null);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MSG);
    } finally {
      setBusy(false);
    }
  }

  const cfg = selected ? CONFIG[selected] : null;

  return (
    <section className="card space-y-3 border-2 border-brand-100">
      <h2 className="text-lg font-bold">
        Acciones <span className="font-normal text-slate-500">· estado actual: {STATUS_LABEL[status]}</span>
      </h2>
      {!cfg ? (
        <div className="flex flex-wrap gap-2">
          {options.map((t) => (
            <button key={t} type="button" className={CONFIG[t].className} onClick={() => open(t)}>
              {CONFIG[t].label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-medium">{cfg.prompt}</p>
          <div>
            <label htmlFor="decision-comment" className="label">
              Comentario {cfg.requiresComment ? "*" : "(opcional)"}
            </label>
            <textarea
              id="decision-comment"
              className="input min-h-24"
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          {error ? <Alert kind="error">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cfg.className}
              disabled={busy || (cfg.requiresComment && comment.trim().length < 5)}
              onClick={confirm}
            >
              {busy ? "Guardando…" : `Confirmar: ${cfg.label.replace(/^[^\p{L}]+/u, "")}`}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setSelected(null)}>
              Volver
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
