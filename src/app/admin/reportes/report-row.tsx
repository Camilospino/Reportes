import { PRIORITY_LABEL, STATUS_LABEL } from "@/domain/labels";
import type { DamageCategory, Priority, ReportStatus } from "@/domain/types";

/** Fila de la lista de reportes (lo que necesitan la tabla y el panel lateral). */
export type ReportRow = {
  id: string;
  code: number;
  street: string;
  neighborhood: string;
  city: string;
  category: DamageCategory;
  priority: Priority;
  status: ReportStatus;
  assignedToId: string | null;
  assignedName: string | null;
  version: number;
  createdDay: string;
  createdTime: string;
};

/** Colores por estado: pastilla (fondo/texto) y punto. Todos con contraste ≥ 4.5:1. */
export const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string; dot: string }> = {
  PENDIENTE: { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB" },
  EN_PROCESO: { bg: "#EDE9FE", text: "#5B21B6", dot: "#7C3AED" },
  REALIZADO: { bg: "#DCFCE7", text: "#166534", dot: "#16A34A" },
  APLAZADO: { bg: "#FEF3C7", text: "#92400E", dot: "#D97706" },
  CLIENTE_AUSENTE: { bg: "#FFEDD5", text: "#9A3412", dot: "#EA580C" },
  VERIFICADO: { bg: "#CCFBF1", text: "#115E59", dot: "#0D9488" },
  CANCELADO: { bg: "#F1F5F9", text: "#475569", dot: "#94A3B8" },
};

const PRIORITY_BARS: Record<Priority, { filled: number; color: string }> = {
  ALTA: { filled: 3, color: "#DC2626" },
  MEDIA: { filled: 2, color: "#D97706" },
  BAJA: { filled: 1, color: "#64748B" },
};

export function PriorityBars({ priority }: { priority: Priority }) {
  const { filled, color } = PRIORITY_BARS[priority];
  return (
    <span className="flex items-center gap-2 text-sm text-[#334155]">
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[6, 10, 14].map((h, i) => (
          <span key={h} className="w-1 rounded-[2px]" style={{ height: h, background: i < filled ? color : "#E2E8F0" }} />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusPill({ status }: { status: ReportStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[13px] font-bold whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
