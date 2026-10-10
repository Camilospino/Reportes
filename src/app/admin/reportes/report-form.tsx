"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/alert";
import { EquipmentField } from "@/components/equipment-editor";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";
import { CATEGORY_LABEL, ORDER_TYPE_LABEL, PRIORITY_LABEL, WITHDRAWAL_REASON_LABEL } from "@/domain/labels";
import {
  CATEGORIES,
  PRIORITIES,
  WITHDRAWAL_REASONS,
  type ActionResult,
  type DamageCategory,
  type OrderType,
  type Priority,
  type WithdrawalReason,
} from "@/domain/types";

export type ReportFormValues = {
  /** El tipo no se cambia al editar. */
  type: OrderType;
  street: string;
  neighborhood: string;
  referencePoint: string;
  category: DamageCategory | "";
  description: string;
  plan: string;
  suggestedDate: string;
  withdrawalReason: WithdrawalReason | "";
  withdrawalReasonOther: string;
  /** Instalaciones y retiros. */
  equipment: { id?: string; kind: string; serial: string | null }[];
  priority: Priority | "";
  clientName: string;
  clientPhone: string;
  contractNumber: string;
  assignedToId: string;
  version?: number;
};

type FormState = ActionResult & { values?: ReportFormValues; attempt?: number };

type Props = {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  technicians: { id: string; name: string }[];
  initial: ReportFormValues;
  /** El técnico no se puede cambiar cuando el reporte ya está en proceso. */
  lockTechnician?: boolean;
  submitLabel: string;
  cancelHref: string;
};

/** Formulario de creación/edición de reporte (la validación definitiva ocurre en el servidor). */
export function ReportForm({ action, technicians, initial: initialValues, lockTechnician, submitLabel, cancelHref }: Props) {
  // React vacía el formulario después de cada envío. Si el servidor lo rechaza, se vuelve a
  // armar (key distinta) con lo que escribió el administrador para que solo corrija el campo marcado.
  const [state, formAction] = useActionState(async (prev: FormState | null, fd: FormData): Promise<FormState> => {
    const result = await action(prev, fd);
    if (result.ok) return result;
    const sent = Object.fromEntries(fd) as Record<string, string>;
    let equipment = initialValues.equipment;
    try {
      if (sent.equipment) equipment = JSON.parse(sent.equipment);
    } catch {
      // Se conserva la lista inicial.
    }
    const values = { ...initialValues, ...(sent as Partial<ReportFormValues>), type: initialValues.type, equipment };
    return { ...result, values, attempt: (prev?.attempt ?? 0) + 1 };
  }, null);
  const e = state && !state.ok ? state.fieldErrors : undefined;
  const initial = state?.values ?? initialValues;

  return (
    <form key={state?.attempt ?? 0} action={formAction} className="space-y-4">
      {state && !state.ok ? <Alert kind="error">{state.error}</Alert> : null}
      {initial.version !== undefined ? <input type="hidden" name="version" value={initial.version} /> : null}
      <input type="hidden" name="type" value={initial.type} />

      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-bold">Dirección</legend>
        <TextField label="Calle / dirección *" name="street" defaultValue={initial.street} required maxLength={200} placeholder="Ej.: Calle 45 # 12-30" errors={e?.street} />
        <TextField label="Barrio *" name="neighborhood" defaultValue={initial.neighborhood} required maxLength={120} errors={e?.neighborhood} />
        <TextField label="Punto de referencia" name="referencePoint" defaultValue={initial.referencePoint} maxLength={200} placeholder="Ej.: Frente al parque, casa esquinera azul" errors={e?.referencePoint} />
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-bold">{ORDER_TYPE_LABEL[initial.type]}</legend>
        {initial.type === "INSTALACION" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Plan o velocidad *" name="plan" defaultValue={initial.plan} required maxLength={60} placeholder="Ej.: 300 Mbps" errors={e?.plan} />
            <TextField label="Fecha sugerida para la visita" name="suggestedDate" type="date" defaultValue={initial.suggestedDate} errors={e?.suggestedDate} />
          </div>
        ) : null}
        {initial.type === "RETIRO" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Motivo del retiro *"
              name="withdrawalReason"
              defaultValue={initial.withdrawalReason}
              required
              placeholder="Seleccione…"
              options={WITHDRAWAL_REASONS.map((r) => ({ value: r, label: WITHDRAWAL_REASON_LABEL[r] }))}
              errors={e?.withdrawalReason}
            />
            <TextField label="Otro motivo (si eligió Otro)" name="withdrawalReasonOther" defaultValue={initial.withdrawalReasonOther} maxLength={200} errors={e?.withdrawalReasonOther} />
          </div>
        ) : null}
        {initial.type !== "DANO" ? (
          <EquipmentField
            initial={initial.equipment}
            label={initial.type === "INSTALACION" ? "Equipos a instalar *" : "Equipos a retirar *"}
            error={e?.equipment?.[0]}
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {initial.type === "DANO" ? (
            <SelectField
              label="Categoría *"
              name="category"
              defaultValue={initial.category}
              required
              placeholder="Seleccione…"
              options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
              errors={e?.category}
            />
          ) : null}
          <SelectField
            label="Prioridad *"
            name="priority"
            defaultValue={initial.priority}
            required
            placeholder="Seleccione…"
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            errors={e?.priority}
          />
        </div>
        {initial.type === "DANO" ? (
          <TextAreaField label="Descripción del posible daño *" name="description" defaultValue={initial.description} required maxLength={2000} placeholder="Ej.: Sin internet desde ayer, la luz LOS del router está en rojo." errors={e?.description} />
        ) : (
          <TextAreaField label="Observaciones (opcional)" name="description" defaultValue={initial.description} maxLength={2000} errors={e?.description} />
        )}
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-bold">Cliente y asignación</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombre del cliente *" name="clientName" defaultValue={initial.clientName} required maxLength={120} autoComplete="off" errors={e?.clientName} />
          <TextField label="Teléfono del cliente *" name="clientPhone" type="tel" inputMode="tel" defaultValue={initial.clientPhone} required maxLength={20} placeholder="3001234567" errors={e?.clientPhone} />
        </div>
        <TextField label="Número de contrato *" name="contractNumber" defaultValue={initial.contractNumber} required maxLength={30} autoComplete="off" autoCapitalize="characters" placeholder="Ej.: CTG-004512" hint="Aparece en la factura del cliente." errors={e?.contractNumber} />
        {lockTechnician ? (
          <>
            <input type="hidden" name="assignedToId" value={initial.assignedToId} />
            <p className="text-sm text-slate-600">
              Técnico asignado: <strong>{technicians.find((t) => t.id === initial.assignedToId)?.name ?? "—"}</strong> (no se
              puede cambiar mientras está en proceso).
            </p>
          </>
        ) : (
          <SelectField
            label="Técnico asignado (opcional)"
            name="assignedToId"
            defaultValue={initial.assignedToId}
            placeholder="Sin asignar — visible para todos los técnicos"
            options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            hint="Si lo asigna, solo ese técnico verá y podrá tomar el reporte."
            errors={e?.assignedToId}
          />
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="btn btn-secondary">
          Cancelar
        </Link>
        <SubmitButton className="btn btn-primary">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
