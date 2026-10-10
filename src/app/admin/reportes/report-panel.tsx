"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { reportCode } from "@/domain/labels";
import { availableTransitions } from "@/domain/report-state";
import { PlazoTag } from "@/components/plazo-tag";
import { TypeTag } from "@/components/type-tag";
import { PriorityBars, STATUS_COLORS, StatusPill, type ReportRow } from "./report-row";

export type AdminTransition = "VERIFICAR" | "RECHAZAR" | "REPROGRAMAR" | "CANCELAR";

/** Mismas decisiones y textos que el panel del detalle del reporte. */
const DECISIONS: Record<AdminTransition, { label: string; prompt: string; requiresComment: boolean; className: string }> = {
  VERIFICAR: {
    label: "Verificar cierre",
    prompt: "Confirma que revisó la evidencia y el trabajo quedó bien hecho.",
    requiresComment: false,
    className: "bg-[#047857] text-white hover:bg-[#065F46]",
  },
  RECHAZAR: {
    label: "Rechazar cierre",
    prompt: "El reporte volverá a Pendiente (con el mismo técnico). Explique qué falta.",
    requiresComment: true,
    className: "bg-[#B91C1C] text-white hover:bg-[#991B1B]",
  },
  REPROGRAMAR: {
    label: "Reprogramar",
    prompt: "El reporte volverá a Pendiente para una nueva visita. Agregue instrucciones.",
    requiresComment: true,
    className: "bg-[#2563EB] text-white hover:bg-[#1D4ED8]",
  },
  CANCELAR: {
    label: "Cancelar reporte",
    prompt: "El reporte quedará cancelado de forma definitiva. Indique el motivo.",
    requiresComment: true,
    className: "border-2 border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
  },
};

/**
 * Panel lateral de un reporte. El estado solo cambia por las decisiones que el administrador tiene
 * permitidas en ese momento (máquina de estados); el técnico solo se cambia con el reporte Pendiente.
 */
export function ReportPanel({
  row,
  now,
  technicians,
  onClose,
  onDecide,
  onAssign,
}: {
  row: ReportRow;
  now: number;
  technicians: { id: string; name: string }[];
  onClose: () => void;
  /** Devuelve el mensaje de error, o null si se guardó. */
  onDecide: (t: AdminTransition, comment: string) => Promise<string | null>;
  onAssign: (technicianId: string | null) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // onClose cambia en cada render del padre: se lee desde un ref para no re-ejecutar el efecto (y robar el foco).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const closeButton = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<AdminTransition | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = availableTransitions(row, { id: "", role: "ADMIN" }).filter((t): t is AdminTransition => t in DECISIONS);
  const canAssign = row.status === "PENDIENTE";

  // Foco al abrir, Escape para cerrar y foco atrapado dentro del panel.
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusables = [
        ...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), select:not([disabled]), textarea"),
      ];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function confirm(t: AdminTransition) {
    const needs = DECISIONS[t].requiresComment;
    if (needs && comment.trim().length < 5) {
      setError("Escriba un comentario (mínimo 5 caracteres) explicando la decisión.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onDecide(t, needs ? comment.trim() : "");
    setBusy(false);
    if (err) setError(err);
    else {
      setSelected(null);
      setComment("");
    }
  }

  const c = STATUS_COLORS[row.status];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[rgba(15,23,42,.35)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[460px] animate-[panel-in_.35s_cubic-bezier(.2,.9,.3,1)] flex-col bg-white shadow-[-20px_0_50px_rgba(15,23,42,.22)] motion-reduce:animate-none"
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E2E8F0] pr-2 pl-6">
          <h2 id="panel-title" className="text-base font-bold text-[#1D4ED8] [font-family:var(--font-code)]">
            {reportCode(row.code)}
          </h2>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-11 items-center justify-center rounded-xl text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <TypeTag type={row.type} />
              <PlazoTag order={row} now={now} />
            </div>
            <p className="text-xl leading-tight font-extrabold text-[#0F172A]">{row.street}</p>
            <p className="text-sm text-[#64748B]">
              {row.neighborhood} · {row.city}
            </p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="font-semibold text-[#64748B]">{row.type === "DANO" ? "Categoría" : "Detalle"}</dt>
            <dd className="text-[#0F172A]">{row.summary}</dd>
            <dt className="font-semibold text-[#64748B]">Prioridad</dt>
            <dd>
              <PriorityBars priority={row.priority} />
            </dd>
            <dt className="font-semibold text-[#64748B]">Creado</dt>
            <dd className="text-[#0F172A]">
              {row.createdDay}, {row.createdTime}
            </dd>
          </dl>

          <section aria-labelledby="estado-label" className="space-y-2.5">
            <h3 id="estado-label" className="text-sm font-bold text-[#334155]">
              Estado
            </h3>
            <div className="rounded-xl px-4 py-3" style={{ background: c.bg }}>
              <StatusPill status={row.status} />
            </div>
            {options.length ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Cambiar estado">
                {options.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selected === t}
                    disabled={busy}
                    onClick={() => {
                      setSelected(t);
                      setError(null);
                    }}
                    className={`min-h-11 rounded-[10px] px-4 text-sm font-bold disabled:opacity-60 ${DECISIONS[t].className} ${
                      selected === t ? "ring-4 ring-[rgba(37,99,235,.25)]" : ""
                    }`}
                  >
                    {DECISIONS[t].label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#64748B]">
                {row.status === "PENDIENTE" || row.status === "EN_PROCESO"
                  ? "Lo cambia el técnico al tomarlo y al registrar la visita."
                  : "No hay decisiones pendientes para este estado."}
              </p>
            )}
            {selected ? (
              <div className="space-y-2 rounded-xl border border-[#E2E8F0] p-3">
                <p className="text-[13px] text-[#334155]">{DECISIONS[selected].prompt}</p>
                {DECISIONS[selected].requiresComment ? (
                  <>
                    <label htmlFor="decision-comment" className="block text-sm font-bold text-[#334155]">
                      Comentario *
                    </label>
                    <textarea
                      id="decision-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="w-full rounded-[10px] border-[1.5px] border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,.18)]"
                    />
                  </>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirm(selected)}
                    className="min-h-11 rounded-[10px] bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                  >
                    {busy ? "Guardando…" : `Confirmar: ${DECISIONS[selected].label}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="min-h-11 rounded-[10px] px-3 text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]"
                  >
                    Volver
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-[13px] font-medium text-[#B91C1C]">
                {error}
              </p>
            ) : null}
          </section>

          <div className="space-y-1.5">
            <label htmlFor="panel-tecnico" className="block text-sm font-bold text-[#334155]">
              Técnico asignado
            </label>
            <select
              id="panel-tecnico"
              value={row.assignedToId ?? ""}
              disabled={!canAssign}
              onChange={(e) => onAssign(e.target.value || null)}
              aria-describedby={canAssign ? undefined : "panel-tecnico-ayuda"}
              className="h-11 w-full rounded-[10px] border-[1.5px] border-[#CBD5E1] bg-white px-3 text-[15px] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,.18)] disabled:bg-[#F1F5F9] disabled:text-[#475569]"
            >
              <option value="">Sin asignar — visible para todos</option>
              {/* Si el asignado ya no está activo, igual se muestra su nombre. */}
              {row.assignedToId && !technicians.some((t) => t.id === row.assignedToId) ? (
                <option value={row.assignedToId}>{row.assignedName ?? "Técnico inactivo"}</option>
              ) : null}
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {canAssign ? null : (
              <p id="panel-tecnico-ayuda" className="text-[13px] text-[#64748B]">
                Solo se puede cambiar mientras el reporte está pendiente.
              </p>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 gap-3 border-t border-[#E2E8F0] px-6 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <Link href={`/admin/reportes/${row.id}`} className="btn btn-secondary flex-1 px-3 text-[15px] whitespace-nowrap">
            Abrir reporte completo
          </Link>
          <button type="button" onClick={onClose} className="min-h-12 w-28 flex-none rounded-xl bg-[#2563EB] font-bold text-white hover:bg-[#1D4ED8] sm:w-auto sm:flex-1">
            Listo
          </button>
        </footer>
      </div>
    </div>
  );
}
