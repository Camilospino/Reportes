import { PackageMinus, Router, Wrench } from "lucide-react";
import { ORDER_TYPE_SHORT } from "@/domain/labels";
import type { OrderType } from "@/domain/types";

/** Colores de cada tipo (texto sobre su fondo ≥ 4.5:1). Siempre con ícono y texto, nunca solo color. */
export const TYPE_STYLE: Record<OrderType, { bg: string; text: string; Icon: typeof Wrench }> = {
  DANO: { bg: "#FEF2F2", text: "#B91C1C", Icon: Wrench },
  INSTALACION: { bg: "#EFF6FF", text: "#1D4ED8", Icon: Router },
  RETIRO: { bg: "#F5F3FF", text: "#6D28D9", Icon: PackageMinus },
};

/** Etiqueta del tipo de orden. Sirve en componentes de servidor y de cliente (no usa hooks). */
export function TypeTag({ type, className = "" }: { type: OrderType; className?: string }) {
  const { bg, text, Icon } = TYPE_STYLE[type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 font-bold whitespace-nowrap ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {ORDER_TYPE_SHORT[type]}
    </span>
  );
}
