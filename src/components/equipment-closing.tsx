"use client";

import { EQUIPMENT_CONDITION_LABEL } from "@/domain/labels";
import { EQUIPMENT_CONDITIONS, type EquipmentCondition, type OrderType } from "@/domain/types";

export type ClosingEquipment = {
  id: string;
  kind: string;
  serial: string | null;
  received?: boolean | null;
  condition?: EquipmentCondition | null;
  observation?: string | null;
};

export type ClosingValue = {
  id: string;
  serial: string;
  received: boolean | null;
  condition: EquipmentCondition | null;
  observation: string;
};

/** Valores iniciales: lo que ya tenga cada equipo (p. ej. si el admin devolvió la orden). */
export function initialClosing(equipment: ClosingEquipment[]): ClosingValue[] {
  return equipment.map((e) => ({
    id: e.id,
    serial: e.serial ?? "",
    received: e.received ?? null,
    condition: e.condition ?? null,
    observation: e.observation ?? "",
  }));
}

/** Mismas reglas que el servidor (validateEquipmentClosing): solo para habilitar el botón. */
export function closingProblem(type: OrderType, values: ClosingValue[]): string | null {
  if (type === "INSTALACION" && values.some((v) => !v.serial.trim())) return "Escriba el serial de cada equipo instalado.";
  if (type === "RETIRO") {
    if (values.some((v) => v.received === null)) return "Marque si recibió cada equipo.";
    if (values.some((v) => v.received && !v.condition)) return "Indique el estado de cada equipo recibido.";
  }
  return null;
}

/** Lo que viaja al servidor. */
export function closingPayload(type: OrderType, values: ClosingValue[]) {
  if (type === "DANO") return [];
  return values.map((v) => ({
    id: v.id,
    serial: v.serial.trim() || undefined,
    ...(type === "RETIRO"
      ? { received: v.received ?? undefined, condition: v.received ? (v.condition ?? undefined) : undefined }
      : {}),
    observation: v.observation.trim() || undefined,
  }));
}

const input =
  "h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,.15)]";

/**
 * Paso de cierre de equipos antes de marcar Realizado.
 * Instalación: serial de cada equipo instalado. Retiro: recibido sí/no, estado y observación.
 */
export function EquipmentClosing({
  type,
  equipment,
  values,
  onChange,
  disabled = false,
}: {
  type: "INSTALACION" | "RETIRO";
  equipment: ClosingEquipment[];
  values: ClosingValue[];
  onChange: (values: ClosingValue[]) => void;
  disabled?: boolean;
}) {
  const set = (id: string, patch: Partial<ClosingValue>) => onChange(values.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const problem = closingProblem(type, values);

  return (
    <fieldset className="min-w-0 space-y-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-bold text-[#334155]">
        {type === "INSTALACION" ? "Equipos instalados: serial de cada uno *" : "Equipos retirados *"}
      </legend>
      {equipment.map((e, i) => {
        const v = values.find((x) => x.id === e.id)!;
        const n = `${e.kind} (${i + 1})`;
        return (
          <div key={e.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[15px] font-bold text-[#0F172A]">{e.kind}</p>
            {type === "INSTALACION" ? (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-semibold text-[#475569]">Serial *</span>
                <input
                  value={v.serial}
                  onChange={(ev) => set(e.id, { serial: ev.target.value })}
                  maxLength={80}
                  autoComplete="off"
                  aria-label={`Serial de ${n}`}
                  aria-invalid={!v.serial.trim()}
                  className={input}
                />
              </label>
            ) : (
              <>
                {e.serial ? <p className="text-[13px] text-[#475569]">Serial: {e.serial}</p> : null}
                <div className="mt-2" role="group" aria-label={`¿Recibió ${n}?`}>
                  <span className="mb-1 block text-xs font-semibold text-[#475569]">¿Lo recibió? *</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[true, false].map((yes) => {
                      const on = v.received === yes;
                      return (
                        <button
                          key={String(yes)}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set(e.id, { received: yes, condition: yes ? v.condition : null })}
                          className={`h-11 rounded-[10px] border-2 text-sm font-bold ${
                            on
                              ? yes
                                ? "border-[#15803D] bg-[#15803D] text-white"
                                : "border-[#B91C1C] bg-[#B91C1C] text-white"
                              : "border-[#CBD5E1] bg-white text-[#0F172A]"
                          }`}
                        >
                          {yes ? "Sí, recibido" : "No recibido"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {v.received ? (
                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs font-semibold text-[#475569]">Estado *</span>
                    <select
                      value={v.condition ?? ""}
                      onChange={(ev) => set(e.id, { condition: (ev.target.value || null) as EquipmentCondition | null })}
                      aria-label={`Estado de ${n}`}
                      className={input}
                    >
                      <option value="">Seleccione…</option>
                      {EQUIPMENT_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {EQUIPMENT_CONDITION_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!e.serial ? (
                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs font-semibold text-[#475569]">Serial (si lo ve)</span>
                    <input value={v.serial} onChange={(ev) => set(e.id, { serial: ev.target.value })} maxLength={80} autoComplete="off" aria-label={`Serial de ${n}`} className={input} />
                  </label>
                ) : null}
              </>
            )}
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-semibold text-[#475569]">Observación (opcional)</span>
              <input value={v.observation} onChange={(ev) => set(e.id, { observation: ev.target.value })} maxLength={300} aria-label={`Observación de ${n}`} className={input} />
            </label>
          </div>
        );
      })}
      {problem ? <p className="text-sm font-medium text-amber-800">{problem}</p> : null}
    </fieldset>
  );
}
