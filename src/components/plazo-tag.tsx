"use client";

import { Clock } from "lucide-react";
import type { ReportStatus } from "@/domain/types";
import { plazoDeOrden, type Plazo } from "@/lib/plazo";
import { useNow } from "@/lib/use-now";

export type PlazoInput = {
  status: ReportStatus;
  createdAt: Date | string;
  dueAt: Date | string;
  warnFromHours: number;
  completedAt?: Date | string | null;
};

/**
 * Colores por nivel. El punto y el ícono usan el color del nivel (verde #16A34A, amarillo #CA8A04,
 * naranja #EA580C, rojo #DC2626); el texto, un tono más oscuro del mismo color para contraste AA.
 */
export const PLAZO_STYLE: Record<Plazo["nivel"], { bg: string; text: string; icon: string }> = {
  "a-tiempo": { bg: "#F0FDF4", text: "#166534", icon: "#16A34A" },
  atencion: { bg: "#FEFCE8", text: "#854D0E", icon: "#CA8A04" },
  "por-vencer": { bg: "#FFF7ED", text: "#9A3412", icon: "#EA580C" },
  vencido: { bg: "#FEF2F2", text: "#991B1B", icon: "#DC2626" },
  detenido: { bg: "#F1F5F9", text: "#334155", icon: "#64748B" },
  "sin-plazo": { bg: "#F1F5F9", text: "#334155", icon: "#64748B" },
};

/** Estilo de un plazo: en Realizado, verde si cumplió y rojo si no (el texto lo dice igual). */
export function plazoStyle(p: Plazo) {
  if (p.nivel === "detenido") return p.horasRestantes < 0 ? PLAZO_STYLE.vencido : PLAZO_STYLE["a-tiempo"];
  return PLAZO_STYLE[p.nivel];
}

/** Etiqueta del plazo ("Vence en 52 h", "Vencido hace 5 h"). Se recalcula sola cada minuto. */
export function PlazoTag({ order, now: initialNow, className = "" }: { order: PlazoInput; now: number; className?: string }) {
  const now = useNow(initialNow);
  return <PlazoBadge plazo={plazoDeOrden(order, new Date(now))} className={className} />;
}

/** La etiqueta a partir de un plazo ya calculado (quien la usa decide la hora). */
export function PlazoBadge({ plazo: p, className = "" }: { plazo: Plazo; className?: string }) {
  if (p.nivel === "sin-plazo") return null;
  const style = plazoStyle(p);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 font-bold whitespace-nowrap tabular-nums ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      <Clock size={13} strokeWidth={2.4} style={{ color: style.icon }} aria-hidden />
      {p.texto}
    </span>
  );
}
