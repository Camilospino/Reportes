import { PRIORITY_LABEL, STATUS_LABEL } from "@/domain/labels";
import type { Priority, ReportStatus } from "@/domain/types";

const STATUS_STYLE: Record<ReportStatus, string> = {
  PENDIENTE: "bg-sky-100 text-sky-900 ring-sky-300",
  EN_PROCESO: "bg-indigo-100 text-indigo-900 ring-indigo-300",
  REALIZADO: "bg-green-100 text-green-900 ring-green-300",
  APLAZADO: "bg-amber-100 text-amber-900 ring-amber-300",
  CLIENTE_AUSENTE: "bg-orange-100 text-orange-900 ring-orange-300",
  VERIFICADO: "bg-emerald-700 text-white ring-emerald-800",
  CANCELADO: "bg-slate-200 text-slate-700 ring-slate-300",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  ALTA: "bg-red-100 text-red-900 ring-red-300",
  MEDIA: "bg-yellow-100 text-yellow-900 ring-yellow-300",
  BAJA: "bg-slate-100 text-slate-700 ring-slate-300",
};

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${base} ${PRIORITY_STYLE[priority]}`}>Prioridad {PRIORITY_LABEL[priority].toLowerCase()}</span>;
}
