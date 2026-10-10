import { TriangleAlert } from "lucide-react";
import { EQUIPMENT_ACTION_LABEL, EQUIPMENT_CONDITION_LABEL } from "@/domain/labels";
import type { EquipmentAction, EquipmentCondition, OrderType } from "@/domain/types";

export type EquipmentRow = {
  id: string;
  kind: string;
  serial: string | null;
  action: EquipmentAction;
  received: boolean | null;
  condition: EquipmentCondition | null;
  observation: string | null;
};

export const PENDING_PICKUP_MSG = "Equipo pendiente por recoger";

/** Algún equipo de un retiro quedó marcado como no recibido. */
export const hasPendingPickup = (type: OrderType, equipment: Pick<EquipmentRow, "received">[]) =>
  type === "RETIRO" && equipment.some((e) => e.received === false);

/** Sección "Equipos" del detalle: tipo, serial, acción y, en retiros, recibido y estado. */
export function EquipmentTable({
  type,
  equipment,
  showPending = true,
}: {
  type: OrderType;
  equipment: EquipmentRow[];
  /** El Panel ya muestra el aviso arriba del detalle. */
  showPending?: boolean;
}) {
  if (type === "DANO" || equipment.length === 0) return null;
  const retiro = type === "RETIRO";
  return (
    <div className="space-y-2">
      <h3 className="label">Equipos</h3>
      {showPending && hasPendingPickup(type, equipment) ? <PendingPickup /> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Serial</th>
              <th className="px-3 py-2">Acción</th>
              {retiro ? (
                <>
                  <th className="px-3 py-2">Recibido</th>
                  <th className="px-3 py-2">Estado</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {e.kind}
                  {e.observation ? <span className="block text-xs font-normal text-slate-600">{e.observation}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-[13px] text-slate-800">{e.serial ?? <span className="font-sans text-slate-500">Sin serial</span>}</td>
                <td className="px-3 py-2 text-slate-800">{EQUIPMENT_ACTION_LABEL[e.action]}</td>
                {retiro ? (
                  <>
                    <td className="px-3 py-2">
                      {e.received === null ? (
                        <span className="text-slate-500">Por confirmar</span>
                      ) : e.received ? (
                        <span className="font-semibold text-green-800">Sí</span>
                      ) : (
                        <span className="font-semibold text-red-800">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{e.condition ? EQUIPMENT_CONDITION_LABEL[e.condition] : "—"}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PendingPickup({ className = "" }: { className?: string }) {
  return (
    <p role="note" className={`flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm font-bold text-[#991B1B] ${className}`}>
      <TriangleAlert size={16} aria-hidden /> {PENDING_PICKUP_MSG}
    </p>
  );
}
