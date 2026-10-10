"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/alert";
import { TypeTag } from "@/components/type-tag";
import { ORDER_TYPE_LABEL } from "@/domain/labels";
import type { OrderType } from "@/domain/types";
import { NETWORK_ERROR_MSG } from "@/lib/client-utils";
import { saveDeadlineConfigAction } from "../actions";

type Row = { type: OrderType; deadlineHours: number; warnFromHours: number };
type Draft = { type: OrderType; deadlineHours: string; warnFromHours: string };

/** Tabla editable de plazos por tipo. Valida en el navegador y otra vez en el servidor. */
export function DeadlineSettingsForm({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Draft[]>(() =>
    initial.map((r) => ({ type: r.type, deadlineHours: String(r.deadlineHours), warnFromHours: String(r.warnFromHours) })),
  );
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (type: OrderType, patch: Partial<Draft>) => {
    setMessage(null);
    setRows((rs) => rs.map((r) => (r.type === type ? { ...r, ...patch } : r)));
  };

  function problem(r: Draft): string | null {
    const d = Number(r.deadlineHours);
    const w = Number(r.warnFromHours);
    if (!Number.isInteger(d) || d < 1 || d > 720) return "El plazo debe ser de 1 a 720 horas.";
    if (!Number.isInteger(w) || w < 1) return "El aviso debe ser de al menos 1 hora.";
    if (w >= d) return "El aviso debe empezar antes de que venza el plazo.";
    return null;
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = rows.map(problem).find(Boolean);
    if (bad) {
      setMessage({ kind: "error", text: bad });
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveDeadlineConfigAction(rows.map((r) => ({ type: r.type, deadlineHours: Number(r.deadlineHours), warnFromHours: Number(r.warnFromHours) })));
        setMessage(res.ok ? { kind: "success", text: "Plazos guardados. Aplican a las órdenes que se creen desde ahora." } : { kind: "error", text: res.error });
      } catch {
        setMessage({ kind: "error", text: NETWORK_ERROR_MSG });
      }
    });
  }

  const input = "input max-w-28 tabular-nums";
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs font-bold text-slate-600 uppercase">
            <tr>
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2 pr-3">Plazo (horas)</th>
              <th className="py-2 pr-3">Avisar desde (horas)</th>
              <th className="py-2">Por vencer desde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = Number(r.deadlineHours);
              const err = problem(r);
              return (
                <tr key={r.type} className="border-t border-slate-100 align-top">
                  <td className="py-3 pr-3">
                    <TypeTag type={r.type} />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={720}
                      aria-label={`Plazo en horas: ${ORDER_TYPE_LABEL[r.type]}`}
                      value={r.deadlineHours}
                      onChange={(e) => set(r.type, { deadlineHours: e.target.value })}
                      aria-invalid={Boolean(err)}
                      className={input}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      aria-label={`Avisar desde (horas): ${ORDER_TYPE_LABEL[r.type]}`}
                      value={r.warnFromHours}
                      onChange={(e) => set(r.type, { warnFromHours: e.target.value })}
                      aria-invalid={Boolean(err)}
                      className={input}
                    />
                  </td>
                  <td className="py-3 text-slate-700 tabular-nums">{Number.isFinite(d) && d > 0 ? `${Math.round((d * 2) / 3)} h` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar plazos"}
      </button>
    </form>
  );
}
