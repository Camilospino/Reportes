"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Cable, File, Gauge, Router, Star, WifiOff } from "lucide-react";
import { Alert } from "@/components/alert";
import { CATEGORY_LABEL, PRIORITY_LABEL, REPORT_FIELD_LABEL } from "@/domain/labels";
import { REPORT_TEMPLATES, TEMPLATE_BLANK, type ReportTemplate } from "@/domain/report-templates";
import { fieldErrors, reportInputSchema } from "@/domain/schemas";
import { CATEGORIES, type ActionResult, type Priority } from "@/domain/types";

const TEMPLATE_ICONS = { "wifi-off": WifiOff, gauge: Gauge, cable: Cable, router: Router, file: File } as const;

/** Orden de los botones de prioridad (de menor a mayor) y su color. Tonos oscurecidos para 4.5:1 con texto blanco. */
const PRIORITY_BUTTONS: { value: Priority; className: string }[] = [
  { value: "BAJA", className: "border-[#15803D] bg-[#15803D]" },
  { value: "MEDIA", className: "border-[#A16207] bg-[#A16207]" },
  { value: "ALTA", className: "border-[#C2410C] bg-[#C2410C]" },
];

type Values = {
  street: string;
  neighborhood: string;
  referencePoint: string;
  category: string;
  priority: string;
  description: string;
  clientName: string;
  clientPhone: string;
  contractNumber: string;
  assignedToId: string;
};
type Field = keyof Values;

const EMPTY: Values = {
  street: "",
  neighborhood: "",
  referencePoint: "",
  category: "",
  priority: "",
  description: "",
  clientName: "",
  clientPhone: "",
  contractNumber: "",
  assignedToId: "",
};

/** Orden visual de los campos obligatorios (para el foco y la lista "Faltan"). */
const REQUIRED_ORDER: Field[] = [
  "category",
  "priority",
  "description",
  "street",
  "neighborhood",
  "clientName",
  "clientPhone",
  "contractNumber",
];

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 10);
/** 3001234567 → "300 123 4567" mientras se escribe. */
function formatPhone(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(" ");
}

/** Reglas del navegador: las del servidor (mismo esquema Zod) más teléfono de 10 dígitos y sin "____". */
function validate(v: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const parsed = reportInputSchema.safeParse(v);
  if (!parsed.success) {
    for (const [k, msgs] of Object.entries(fieldErrors(parsed.error))) {
      if (k in EMPTY && msgs?.[0]) errors[k as Field] = msgs[0];
    }
  }
  if (onlyDigits(v.clientPhone).length !== 10) errors.clientPhone = "Ingrese un teléfono de 10 dígitos.";
  if (!errors.description && v.description.includes(TEMPLATE_BLANK)) {
    errors.description = "Complete los espacios ____ de la descripción.";
  }
  return errors;
}

/**
 * "Nuevo reporte" desde plantillas: el administrador elige el tipo de daño y el formulario aparece
 * con categoría, prioridad y descripción ya llenas. Guarda con la misma acción de siempre
 * (createReportAction), que valida otra vez en el servidor y redirige al reporte creado.
 */
export function NewReportForm({
  action,
  technicians,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  technicians: { id: string; name: string }[];
}) {
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusAfterPick, setFocusAfterPick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const fill = template?.fill ?? null;
  /** El campo aún tiene el valor que puso la plantilla (se pinta en azul). */
  const prefilled = (f: "category" | "priority" | "description") => fill !== null && values[f] === fill[f];

  function pick(t: ReportTemplate) {
    setValues((v) => {
      // Solo se reemplazan los tres campos de plantilla; lo demás que ya escribió se conserva.
      // "En blanco" vacía únicamente los que seguían intactos desde la plantilla anterior.
      if (t.fill) return { ...v, category: t.fill.category, priority: t.fill.priority, description: t.fill.description };
      const prev = template?.fill;
      if (!prev) return v;
      return {
        ...v,
        category: v.category === prev.category ? "" : v.category,
        priority: v.priority === prev.priority ? "" : v.priority,
        description: v.description === prev.description ? "" : v.description,
      };
    });
    setTemplate(t);
    setFocusAfterPick((n) => n + 1);
  }

  // Tras elegir plantilla: foco en el primer campo obligatorio vacío.
  useEffect(() => {
    if (!focusAfterPick) return;
    const first = REQUIRED_ORDER.find((f) => !values[f].trim());
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(first === "priority" ? '[data-priority="first"]' : `#${first}`);
    el?.focus();
  }, [focusAfterPick]);

  function set(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (triedSubmit) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTriedSubmit(true);
    setServerError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return; // no se envía nada

    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, k === "clientPhone" ? onlyDigits(v) : v);
    startTransition(async () => {
      // Si sale bien, la acción redirige al reporte creado (?msg=creado), como siempre.
      const result = await action(null, fd);
      if (!result.ok) {
        setServerError(result.error);
        const server: Partial<Record<Field, string>> = {};
        for (const [k, msgs] of Object.entries(result.fieldErrors ?? {})) {
          if (k in EMPTY && msgs?.[0]) server[k as Field] = msgs[0];
        }
        setErrors(server);
      }
    });
  }

  const missing = REQUIRED_ORDER.filter((f) => errors[f]).map((f) => REPORT_FIELD_LABEL[f] ?? f);

  return (
    <div className="space-y-6">
      {/* Paso 1: plantillas */}
      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 min-[900px]:grid-cols-5" role="group" aria-label="Plantillas">
        {REPORT_TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICONS[t.icon];
          const selected = template?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              onClick={() => pick(t)}
              className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-[18px] text-left transition duration-200 ease-[cubic-bezier(.3,1.4,.5,1)] hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(15,23,42,.1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 min-[480px]:min-h-[150px] min-[480px]:flex-col min-[480px]:items-start min-[480px]:justify-between ${
                selected ? "border-[#2563EB] shadow-[0_0_0_5px_rgba(37,99,235,.12)]" : "border-[#E2E8F0]"
              }`}
            >
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-[14px] ${
                  selected ? "bg-[#2563EB] text-white" : "bg-[#F1F5F9] text-[#334155]"
                }`}
              >
                <Icon size={24} strokeWidth={2} aria-hidden />
              </span>
              <span>
                <span className="block text-base font-extrabold text-[#0F172A]">{t.title}</span>
                <span className="block text-[13px] text-[#64748B]">{t.help}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Paso 2: formulario */}
      {template ? (
        <form
          ref={formRef}
          onSubmit={submit}
          noValidate
          className="animate-[form-in_.45s_ease-out] overflow-hidden rounded-[18px] border border-[#E2E8F0] bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)] motion-reduce:animate-none"
        >
          {fill ? (
            <p className="flex items-start gap-2 bg-[#EFF6FF] px-6 py-3 text-sm text-[#1E3A8A]">
              <Star size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Plantilla &quot;{template.title}&quot;: los campos en azul ya vienen llenos. Revíselos y complete los espacios ____.
              </span>
            </p>
          ) : null}
          {serverError ? (
            <div className="px-6 pt-5">
              <Alert kind="error">{serverError}</Alert>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] px-6 py-[26px] min-[900px]:grid-cols-2">
            <Section first>Daño</Section>
            <FieldBox id="category" label="Categoría *" error={errors.category}>
              <select
                id="category"
                value={values.category}
                onChange={(e) => set("category", e.target.value)}
                className={inputClass(errors.category, prefilled("category"))}
                {...ariaFor("category", errors.category)}
              >
                <option value="">Seleccione…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </FieldBox>
            <div>
              <p id="priority-label" className="mb-1.5 text-sm font-bold text-[#334155]">
                Prioridad *{" "}
                {prefilled("priority") ? <span className="font-semibold text-[#1E3A8A]">(sugerida)</span> : null}
              </p>
              <div
                role="group"
                aria-labelledby="priority-label"
                aria-describedby={errors.priority ? "priority-error" : undefined}
                className="grid grid-cols-3 gap-2"
              >
                {PRIORITY_BUTTONS.map((p, i) => {
                  const on = values.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      data-priority={i === 0 ? "first" : undefined}
                      aria-pressed={on}
                      onClick={() => set("priority", p.value)}
                      className={`h-[46px] rounded-[10px] border-2 text-sm font-bold transition-colors ${
                        on ? `${p.className} text-white` : errors.priority ? "border-[#DC2626] bg-[#FEF2F2] text-[#0F172A]" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                      }`}
                    >
                      {PRIORITY_LABEL[p.value]}
                    </button>
                  );
                })}
              </div>
              <ErrorText id="priority-error" text={errors.priority} />
            </div>
            <FieldBox id="description" label="Descripción del posible daño *" error={errors.description} wide warn={errors.description?.includes("____")}>
              <textarea
                id="description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={2000}
                rows={4}
                className={`${inputClass(errors.description, prefilled("description"))} h-auto min-h-28 py-3`}
                {...ariaFor("description", errors.description)}
              />
            </FieldBox>
            {!errors.description && values.description.includes(TEMPLATE_BLANK) ? (
              <p className="-mt-3 text-[13px] text-[#B45309] min-[900px]:col-span-2">Complete los espacios ____ de la descripción.</p>
            ) : null}

            <Section>Dirección</Section>
            <FieldBox id="street" label="Calle / dirección *" error={errors.street} wide>
              <input id="street" value={values.street} onChange={(e) => set("street", e.target.value)} maxLength={200} placeholder="Ej.: Calle 45 # 12-30" className={inputClass(errors.street)} {...ariaFor("street", errors.street)} />
            </FieldBox>
            <FieldBox id="neighborhood" label="Barrio *" error={errors.neighborhood}>
              <input id="neighborhood" value={values.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} maxLength={120} className={inputClass(errors.neighborhood)} {...ariaFor("neighborhood", errors.neighborhood)} />
            </FieldBox>
            <FieldBox id="referencePoint" label="Punto de referencia" error={errors.referencePoint}>
              <input id="referencePoint" value={values.referencePoint} onChange={(e) => set("referencePoint", e.target.value)} maxLength={200} placeholder="Ej.: Frente al parque, casa esquinera azul" className={inputClass(errors.referencePoint)} />
            </FieldBox>

            <Section>Cliente y asignación</Section>
            <FieldBox id="clientName" label="Nombre del cliente *" error={errors.clientName}>
              <input id="clientName" value={values.clientName} onChange={(e) => set("clientName", e.target.value)} maxLength={120} autoComplete="off" className={inputClass(errors.clientName)} {...ariaFor("clientName", errors.clientName)} />
            </FieldBox>
            <FieldBox id="clientPhone" label="Teléfono del cliente *" error={errors.clientPhone}>
              <input
                id="clientPhone"
                type="tel"
                inputMode="numeric"
                value={formatPhone(onlyDigits(values.clientPhone))}
                onChange={(e) => set("clientPhone", onlyDigits(e.target.value))}
                placeholder="300 123 4567"
                className={inputClass(errors.clientPhone)}
                {...ariaFor("clientPhone", errors.clientPhone)}
              />
            </FieldBox>
            <FieldBox id="contractNumber" label="Número de contrato *" error={errors.contractNumber} hint="Aparece en la factura.">
              <input
                id="contractNumber"
                value={values.contractNumber}
                onChange={(e) => set("contractNumber", e.target.value.toUpperCase())}
                maxLength={30}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Ej.: CTG-004512"
                className={inputClass(errors.contractNumber)}
                {...ariaFor("contractNumber", errors.contractNumber, "contractNumber-hint")}
              />
            </FieldBox>
            <FieldBox id="assignedToId" label="Técnico asignado (opcional)" error={errors.assignedToId}>
              <select id="assignedToId" value={values.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} className={inputClass(errors.assignedToId)} {...ariaFor("assignedToId", errors.assignedToId)}>
                <option value="">Sin asignar — visible para todos</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FieldBox>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-[#B91C1C]" role="status">
              {triedSubmit && missing.length ? `Faltan: ${missing.join(", ")}.` : ""}
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Link href="/admin/reportes" className="btn btn-secondary">
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={pending}
                className="flex h-[46px] min-w-44 items-center justify-center rounded-xl bg-[#2563EB] px-6 font-extrabold text-white hover:bg-[#1D4ED8] disabled:opacity-70"
              >
                {pending ? "Publicando…" : "Publicar reporte"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function inputClass(error?: string, prefilled = false): string {
  const state = error
    ? "border-[#DC2626] bg-[#FEF2F2]"
    : prefilled
      ? "border-[#93C5FD] bg-[#EFF6FF]"
      : "border-[#CBD5E1] bg-white";
  return `h-[46px] w-full rounded-[10px] border-[1.5px] px-3 text-[15px] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#2563EB] focus:shadow-[0_0_0_4px_rgba(37,99,235,.15)] ${state}`;
}

function ariaFor(id: string, error?: string, hintId?: string) {
  const describedBy = [error ? `${id}-error` : null, hintId && !error ? hintId : null].filter(Boolean).join(" ");
  return { "aria-invalid": Boolean(error), "aria-describedby": describedBy || undefined };
}

function Section({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <div className={`min-[900px]:col-span-2 ${first ? "" : "mt-1 border-t border-[#E2E8F0] pt-5"}`}>
      <h2 className="text-xs font-extrabold tracking-[1px] text-[#64748B] uppercase">{children}</h2>
    </div>
  );
}

function FieldBox({
  id,
  label,
  error,
  hint,
  wide = false,
  warn = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  /** El error de "____" va en ámbar, no en rojo. */
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "min-[900px]:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-[#334155]">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-[13px] text-[#64748B]">
          {hint}
        </p>
      ) : null}
      <ErrorText id={`${id}-error`} text={error} warn={warn} />
    </div>
  );
}

function ErrorText({ id, text, warn = false }: { id: string; text?: string; warn?: boolean }) {
  if (!text) return null;
  return (
    <p id={id} className={`mt-1 text-[13px] font-medium ${warn ? "text-[#B45309]" : "text-[#B91C1C]"}`}>
      {text}
    </p>
  );
}
