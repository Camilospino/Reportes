"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EQUIPMENT_KIND_SUGGESTIONS } from "@/domain/types";

export type EquipmentDraft = { key: string; id?: string; kind: string; serial: string };

let counter = 0;
export const newEquipmentDraft = (kind = ""): EquipmentDraft => ({ key: `eq-${Date.now()}-${counter++}`, kind, serial: "" });

/** Lo que viaja al servidor (campo oculto "equipment", JSON). */
export function equipmentPayload(items: EquipmentDraft[]) {
  return items.map((e) => ({ ...(e.id ? { id: e.id } : {}), kind: e.kind.trim(), serial: e.serial.trim() || undefined }));
}

const input =
  "h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,.15)]";

/**
 * Lista de equipos de una instalación o un retiro: tipo (texto con sugerencias) y serial opcional.
 * "+ Agregar equipo" suma una fila; la papelera la quita (siempre queda al menos una).
 */
export function EquipmentEditor({
  items,
  onChange,
  label,
  error,
}: {
  items: EquipmentDraft[];
  onChange: (items: EquipmentDraft[]) => void;
  label: string;
  error?: string;
}) {
  const listId = useId();
  const errorId = `${listId}-error`;
  const set = (key: string, patch: Partial<EquipmentDraft>) => onChange(items.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="min-w-0">
      <legend className="mb-1.5 text-sm font-bold text-[#334155]">{label}</legend>
      <datalist id={listId}>
        {EQUIPMENT_KIND_SUGGESTIONS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <ul className="space-y-2">
        {items.map((e, i) => (
          <li key={e.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <label className="min-w-0">
              <span className="mb-1 block text-xs font-semibold text-[#475569]">Equipo {i + 1}: tipo *</span>
              <input
                list={listId}
                value={e.kind}
                onChange={(ev) => set(e.key, { kind: ev.target.value })}
                maxLength={40}
                placeholder="Router, ONU…"
                aria-invalid={Boolean(error) && !e.kind.trim()}
                className={input}
              />
            </label>
            <label className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <span className="mb-1 block text-xs font-semibold text-[#475569]">Serial (si lo conoce)</span>
              <input value={e.serial} onChange={(ev) => set(e.key, { serial: ev.target.value })} maxLength={80} autoComplete="off" className={input} />
            </label>
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x.key !== e.key))}
              disabled={items.length === 1}
              aria-label={`Quitar equipo ${i + 1}`}
              className="mt-5 flex size-11 items-center justify-center self-start rounded-[10px] text-[#B91C1C] hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:hover:bg-transparent"
            >
              <Trash2 size={18} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {items.length < 10 ? (
        <button
          type="button"
          onClick={() => onChange([...items, newEquipmentDraft()])}
          className="mt-2 flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-bold text-[#1D4ED8] hover:bg-[#EFF6FF]"
        >
          <Plus size={18} aria-hidden /> Agregar equipo
        </button>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-[13px] font-medium text-[#B91C1C]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Para formularios sin estado propio (edición): guarda la lista en un campo oculto "equipment". */
export function EquipmentField({
  initial,
  label,
  error,
}: {
  initial: { id?: string; kind: string; serial: string | null }[];
  label: string;
  error?: string;
}) {
  const [items, setItems] = useState<EquipmentDraft[]>(() =>
    initial.length ? initial.map((e) => ({ ...newEquipmentDraft(e.kind), id: e.id, serial: e.serial ?? "" })) : [newEquipmentDraft()],
  );
  return (
    <>
      <input type="hidden" name="equipment" value={JSON.stringify(equipmentPayload(items))} />
      <EquipmentEditor items={items} onChange={setItems} label={label} error={error} />
    </>
  );
}
