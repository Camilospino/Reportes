"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Inbox, LoaderCircle, MousePointerClick } from "lucide-react";
import { PRIORITY_LABEL, STATUS_LABEL, reportCode } from "@/domain/labels";
import { REPORT_STATUSES, type ActionResult, type Priority, type ReportStatus } from "@/domain/types";
import { newId, withRetry } from "@/lib/client-utils";
import { cancelarReporte, devolverReporte, reprogramarReporte, verificarReporte } from "../actions";
import { interTight, panelMono } from "../fonts";

type ReviewStatus = "REALIZADO" | "APLAZADO" | "CLIENTE_AUSENTE";
export type InboxFilter = "todos" | "realizado" | "aplazado" | "ausente";

export type InboxEvent = {
  id: string;
  label: string;
  actor: string | null;
  at: string;
  note: string | null;
  status: ReportStatus | null;
};

export type InboxItem = {
  id: string;
  code: number;
  street: string;
  neighborhood: string;
  city: string;
  category: string;
  priority: Priority;
  status: ReviewStatus;
  technician: string | null;
  client: string | null;
  updatedLabel: string;
  history: InboxEvent[];
};

type Decision = "verificar" | "devolver" | "reprogramar" | "cancelar";
type State = { items: InboxItem[]; counts: Record<ReportStatus, number> };
type Toast = { text: string; error?: boolean; key: number };

const NOTE_MAX = 500;
const TOAST_MS = 3000;
const OFFLINE_MSG = "Sin conexión. Intente de nuevo.";

/** Colores de la franja de estados (punto). */
const STRIP_DOT: Record<ReportStatus | "TODOS", string> = {
  TODOS: "#0F172A",
  PENDIENTE: "#2563EB",
  EN_PROCESO: "#7C3AED",
  REALIZADO: "#16A34A",
  APLAZADO: "#D97706",
  CLIENTE_AUSENTE: "#EA580C",
  VERIFICADO: "#0D9488",
  CANCELADO: "#94A3B8",
};

/** Colores de la bandeja: el punto usa el tono de diseño; la pastilla, uno más oscuro para contraste AA con texto blanco. */
const INBOX_DOT: Record<ReviewStatus, string> = { REALIZADO: "#059669", APLAZADO: "#D97706", CLIENTE_AUSENTE: "#7C3AED" };
const INBOX_PILL: Record<ReviewStatus, string> = { REALIZADO: "#047857", APLAZADO: "#B45309", CLIENTE_AUSENTE: "#7C3AED" };

const PRIORITY_PILL: Record<Priority, string> = {
  ALTA: "bg-[#FEF2F2] text-[#B91C1C]",
  MEDIA: "bg-[#FFFBEB] text-[#B45309]",
  BAJA: "bg-[#F1F5F9] text-[#475569]",
};

const FILTER_TABS: { id: InboxFilter; label: string; match: (s: ReviewStatus) => boolean }[] = [
  { id: "todos", label: "Todos", match: () => true },
  { id: "realizado", label: "Realizados", match: (s) => s === "REALIZADO" },
  { id: "aplazado", label: "Aplazados", match: (s) => s === "APLAZADO" },
  { id: "ausente", label: "Ausente", match: (s) => s === "CLIENTE_AUSENTE" },
];

const DECISIONS: Record<
  Decision,
  { label: string; key: string; to: ReportStatus; action: (input: unknown) => Promise<ActionResult>; toast: (code: string, it: InboxItem) => string }
> = {
  verificar: { label: "Verificar", key: "V", to: "VERIFICADO", action: verificarReporte, toast: (c) => `${c} verificado` },
  devolver: {
    label: "Devolver al técnico",
    key: "D",
    to: "PENDIENTE",
    action: devolverReporte,
    toast: (c, it) => `${c} vuelve a Pendiente${it.technician ? ` con ${it.technician}` : ""}`,
  },
  reprogramar: {
    label: "Reprogramar",
    key: "R",
    to: "PENDIENTE",
    action: reprogramarReporte,
    toast: (c, it) => `${c} vuelve a Pendiente${it.technician ? ` con ${it.technician}` : ""}`,
  },
  cancelar: { label: "Cancelar reporte", key: "C", to: "CANCELADO", action: cancelarReporte, toast: (c) => `${c} cancelado` },
};

/** Decisión principal y secundaria según el estado. */
const choicesFor = (s: ReviewStatus): [Decision, Decision] => (s === "REALIZADO" ? ["verificar", "devolver"] : ["reprogramar", "cancelar"]);

function applyDecision(state: State, { item, decision }: { item: InboxItem; decision: Decision }): State {
  const counts = { ...state.counts };
  counts[item.status] = Math.max(0, counts[item.status] - 1);
  counts[DECISIONS[decision].to] += 1;
  return { items: state.items.filter((i) => i.id !== item.id), counts };
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]";

/**
 * Bandeja de revisión del administrador: lista de reportes Realizado / Aplazado / Cliente ausente
 * y detalle con historial y decisiones. Filtro y selección viven en la URL (?f=…&id=R-000016).
 * Las decisiones se ven al instante (useOptimistic) y la Server Action revalida con datos reales.
 */
export function BandejaPanel({
  items,
  counts,
  initialFilter,
  initialCode,
}: {
  items: InboxItem[];
  counts: Record<ReportStatus, number>;
  initialFilter: InboxFilter;
  initialCode: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = useMemo<State>(() => ({ items, counts }), [items, counts]);
  const [state, addOptimistic] = useOptimistic(base, applyDecision);
  const [acting, startAction] = useTransition();

  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(() => items.find((i) => i.code === initialCode)?.id ?? null);
  const [pending, setPending] = useState<Decision | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const busy = acting || pending !== null;
  /** El detalle registra aquí sus atajos (V/R/D/C), porque la nota y la confirmación viven en él. */
  const detailKeys = useRef<((e: KeyboardEvent) => void) | null>(null);
  const registerKeys = useCallback((fn: ((e: KeyboardEvent) => void) | null) => {
    detailKeys.current = fn;
  }, []);

  const tab = FILTER_TABS.find((t) => t.id === filter)!;
  const visible = state.items.filter((i) => tab.match(i.status));
  const selected = state.items.find((i) => i.id === selectedId) ?? null;
  const reviewTotal = state.items.length;

  // Filtro y selección en la URL, con router.replace (sin historial ni scroll). Se espera a que no
  // haya una decisión en curso: navegar durante una Server Action descarta su respuesta revalidada.
  const selectedCode = selected ? reportCode(selected.code) : null;
  useEffect(() => {
    if (busy) return;
    const sp = new URLSearchParams();
    if (filter !== "todos") sp.set("f", filter);
    if (selectedCode) sp.set("id", selectedCode);
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (url !== `${window.location.pathname}${window.location.search}`) router.replace(url, { scroll: false });
  }, [filter, selectedCode, busy, pathname, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  function decide(decision: Decision, note: string) {
    const item = selected;
    if (!item || busy) return;
    const code = reportCode(item.code);
    if (!navigator.onLine) {
      setToast({ text: OFFLINE_MSG, error: true, key: Date.now() });
      return;
    }
    // Al decidir, se selecciona solo el siguiente de la lista filtrada.
    const idx = visible.findIndex((i) => i.id === item.id);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setPending(decision);
    const requestId = newId(); // mismo id en los reintentos: el servidor no duplica la decisión
    startAction(async () => {
      addOptimistic({ item, decision });
      setSelectedId(next?.id ?? null);
      let res: ActionResult;
      try {
        res = await withRetry(() => DECISIONS[decision].action({ id: item.id, requestId, nota: note || undefined }), { attempts: 3 });
      } catch {
        res = { ok: false, error: OFFLINE_MSG };
      }
      setPending(null);
      if (res.ok) {
        setToast({ text: DECISIONS[decision].toast(code, item), key: Date.now() });
      } else {
        setToast({ text: res.error, error: true, key: Date.now() });
        setSelectedId(item.id);
        router.refresh();
      }
    });
  }

  // Teclado (fuera de campos de texto): ↑/↓ cambian de reporte; V/R/D/C los atajos del detalle.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (e.altKey || e.ctrlKey || e.metaKey || el?.closest("textarea, input, select, [contenteditable='true']")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (visible.length === 0) return;
      e.preventDefault();
      const idx = visible.findIndex((i) => i.id === selectedId);
      const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
      const id = visible[next]!.id;
      setSelectedId(id);
      document.getElementById(`inbox-row-${id}`)?.focus();
      return;
    }
    detailKeys.current?.(e);
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const allCount = REPORT_STATUSES.reduce((n, s) => n + state.counts[s], 0);

  return (
    <div className={`${interTight.className} text-[#0F172A] lg:flex lg:h-[calc(100dvh-132px)] lg:min-h-[640px] lg:flex-col lg:gap-4`}>
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.5px]">Panel</h1>
          <p className="text-sm font-semibold text-[#475569]">
            {reviewTotal} por revisar
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Filtrar bandeja"
          className="grid w-full grid-cols-4 gap-1 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white p-1 sm:ml-auto sm:flex sm:w-auto"
        >
          {FILTER_TABS.map((t) => {
            const active = t.id === filter;
            const n = state.items.filter((i) => t.match(i.status)).length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.id)}
                className={`flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-[13px] font-bold whitespace-nowrap sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm ${focusRing} ${
                  active ? "bg-[#0F172A] text-white" : "text-[#475569] hover:bg-[#F1F5F9]"
                }`}
              >
                {t.label}
                <span className={`text-xs tabular-nums ${active ? "text-[#E2E8F0]" : "text-[#64748B]"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Franja de estados: enlaces a la lista filtrada */}
      <section aria-label="Reportes por estado" className="mt-4 grid grid-cols-4 gap-[10px] lg:mt-0 lg:grid-cols-8">
        {(["TODOS", ...REPORT_STATUSES] as const).map((s) => (
          <Link
            key={s}
            href={s === "TODOS" ? "/admin/reportes" : `/admin/reportes?estado=${s}`}
            className={`min-w-0 rounded-[14px] border-[1.5px] border-[#E2E8F0] bg-white px-2.5 py-2.5 transition-colors hover:border-[#CBD5E1] lg:px-3.5 lg:py-3 ${focusRing}`}
          >
            {/* En celular el punto va encima: la etiqueta usa todo el ancho y solo "Cliente ausente" pasa a dos líneas. */}
            <span className="flex flex-col items-start gap-1 text-xs leading-4 font-semibold text-[#475569] lg:flex-row lg:items-center lg:gap-1.5 lg:text-[13px] lg:leading-tight">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STRIP_DOT[s] }} aria-hidden />
              <span className="min-h-8 min-w-0 lg:min-h-0 lg:truncate">{s === "TODOS" ? "Todos" : STATUS_LABEL[s]}</span>
            </span>
            <AnimatedCount value={s === "TODOS" ? allCount : state.counts[s]} />
          </Link>
        ))}
      </section>

      {/* Bandeja de dos columnas */}
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#E2E8F0] bg-white lg:mt-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[420px_1fr]">
        <ul aria-label="Reportes por revisar" className="divide-y divide-[#F1F5F9] lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-[#E2E8F0]">
          {visible.length === 0 ? (
            <li className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-[#64748B]">
              <Inbox size={36} strokeWidth={1.5} className="text-[#CBD5E1]" aria-hidden />
              <span className="text-base font-bold text-[#475569]">Bandeja vacía</span>
            </li>
          ) : (
            visible.map((it) => (
              <li key={it.id}>
                <InboxRow item={it} selected={it.id === selectedId} onSelect={() => select(it.id)} />
              </li>
            ))
          )}
        </ul>

        {/* Detalle: columna en escritorio; pantalla completa en celular y tableta */}
        <section
          aria-label="Detalle del reporte"
          className={`${selected ? "fixed inset-0 z-50 flex" : "hidden"} flex-col bg-white lg:static lg:z-auto lg:flex lg:min-h-0`}
        >
          {selected ? (
            <Detail
              key={selected.id}
              item={selected}
              busy={busy}
              pending={pending}
              onBack={() => select(null)}
              onDecide={decide}
              registerKeys={registerKeys}
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-[#64748B] lg:flex">
              <MousePointerClick size={32} strokeWidth={1.5} className="text-[#CBD5E1]" aria-hidden />
              <p className="text-base font-semibold">Elija un reporte de la bandeja</p>
            </div>
          )}
        </section>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex justify-center lg:bottom-8"
      >
        {toast ? (
          <p
            key={toast.key}
            className={`max-w-md animate-[toast-in_.25s_ease-out_both] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,.3)] motion-reduce:animate-none ${
              toast.error ? "bg-[#991B1B]" : "bg-[#0F172A]"
            }`}
          >
            {toast.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Número que hace una escala corta cuando cambia (no al montar). */
function AnimatedCount({ value }: { value: number }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setBump((b) => b + 1);
    }
  }, [value]);
  return (
    <span
      key={bump}
      className={`mt-1 block text-[30px] leading-none font-extrabold tabular-nums ${
        bump > 0 ? "animate-[count-pop_.45s_ease-out] motion-reduce:animate-none" : ""
      }`}
    >
      {value}
    </span>
  );
}

function InboxRow({ item, selected, onSelect }: { item: InboxItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      id={`inbox-row-${item.id}`}
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`relative block w-full px-5 py-3.5 text-left transition-colors ${focusRing} focus-visible:-outline-offset-2 ${
        selected ? "bg-[#EEF2FF]" : "hover:bg-[#F1F5F9]"
      }`}
    >
      {selected ? <span className="absolute inset-y-0 left-0 w-[3px] bg-[#4F46E5]" aria-hidden /> : null}
      <span className="flex items-center gap-2.5">
        <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: INBOX_DOT[item.status] }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{item.street}</span>
        <span className="shrink-0 text-xs text-[#475569] tabular-nums">{item.updatedLabel}</span>
      </span>
      <span className="mt-1 block truncate pl-[19px] text-[13px] text-[#475569]">
        {STATUS_LABEL[item.status]} · {item.technician ?? "Sin técnico"}
      </span>
    </button>
  );
}

function Detail({
  item,
  busy,
  pending,
  onBack,
  onDecide,
  registerKeys,
}: {
  item: InboxItem;
  busy: boolean;
  pending: Decision | null;
  onBack: () => void;
  onDecide: (d: Decision, note: string) => void;
  registerKeys: (fn: ((e: KeyboardEvent) => void) | null) => void;
}) {
  // El componente se monta de nuevo al cambiar de reporte (key), así la nota se limpia sola.
  const [note, setNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [primary, secondary] = choicesFor(item.status);
  const code = reportCode(item.code);

  const run = (d: Decision) => {
    if (busy) return;
    if (d === "cancelar" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    onDecide(d, note.trim());
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const k = e.key.toUpperCase();
    const hit = [primary, secondary].find((d) => DECISIONS[d].key === k);
    if (!hit) return;
    e.preventDefault();
    run(hit);
  });
  useEffect(() => {
    registerKeys((e) => onKey(e));
    return () => registerKeys(null);
  }, [registerKeys]);

  return (
    <div className="flex min-h-0 flex-1 animate-[detail-in_.3s_ease-out_both] flex-col motion-reduce:animate-none">
      <div className="border-b border-[#E2E8F0] px-4 py-2 lg:hidden">
        <button type="button" onClick={onBack} className={`flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-bold text-[#4338CA] ${focusRing}`}>
          <ArrowLeft size={18} aria-hidden /> Volver a la bandeja
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-6 lg:px-8 lg:pt-7">
        <div aria-live="polite" aria-atomic="true">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${panelMono.className} text-sm font-bold text-[#334155]`}>{code}</span>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: INBOX_PILL[item.status] }}>
              {STATUS_LABEL[item.status]}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_PILL[item.priority]}`}>
              Prioridad {PRIORITY_LABEL[item.priority].toLowerCase()}
            </span>
          </div>
          <h2 className="mt-3 text-[28px] leading-tight font-extrabold tracking-[-0.5px]">{item.street}</h2>
          <p className="mt-1 text-base text-[#475569]">
            {item.neighborhood}, {item.city} · {item.category}
          </p>
        </div>

        <dl className="mt-5 grid gap-2 sm:grid-cols-3">
          <InfoBox label="Técnico" value={item.technician ?? "Sin técnico"} />
          <InfoBox label="Último cambio" value={item.updatedLabel} />
          {item.client ? <InfoBox label="Cliente" value={item.client} /> : null}
        </dl>

        <h3 className="mt-7 text-sm font-extrabold tracking-[.3px] text-[#334155] uppercase">Historial</h3>
        <ol className="mt-3 ml-1.5 space-y-4 border-l-2 border-[#E2E8F0]">
          {item.history.map((ev) => (
            <li key={ev.id} className="relative pl-5">
              <span
                className="absolute top-1.5 -left-[6px] size-2.5 rounded-full ring-2 ring-white"
                style={{ backgroundColor: ev.status ? STRIP_DOT[ev.status] : "#94A3B8" }}
                aria-hidden
              />
              <p className="text-sm font-bold text-[#0F172A]">
                {ev.label}
                {ev.actor ? <span className="font-medium text-[#475569]"> · {ev.actor}</span> : null}
              </p>
              <p className="text-xs text-[#475569] tabular-nums">{ev.at}</p>
              {ev.note ? <p className="mt-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm whitespace-pre-wrap text-[#334155]">{ev.note}</p> : null}
            </li>
          ))}
        </ol>

        <div className="mt-7">
          <div className="flex items-baseline justify-between">
            <label htmlFor="panel-note" className="text-sm font-bold text-[#334155]">
              Nota para el técnico (opcional)
            </label>
            <span className="text-xs text-[#475569] tabular-nums" aria-live="polite">
              {note.length}/{NOTE_MAX}
            </span>
          </div>
          <textarea
            id="panel-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: volver con el equipo de repuesto"
            className={`mt-1.5 block w-full resize-none rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 py-2.5 text-[15px] placeholder:text-[#64748B] focus:border-[#4F46E5] ${focusRing}`}
          />
        </div>

        {/* Escritorio: botones al final del detalle */}
        <div className="mt-5 hidden lg:block">
          <Actions code={code} primary={primary} secondary={secondary} busy={busy} pending={pending} confirmCancel={confirmCancel} onRun={run} onNo={() => setConfirmCancel(false)} />
        </div>
      </div>

      {/* Celular y tableta: barra fija abajo */}
      <div className="border-t border-[#E2E8F0] bg-white px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,.08)] lg:hidden">
        <Actions code={code} primary={primary} secondary={secondary} busy={busy} pending={pending} confirmCancel={confirmCancel} onRun={run} onNo={() => setConfirmCancel(false)} />
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F8FAFC] px-4 py-3">
      <dt className="text-xs font-semibold text-[#475569]">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Actions({
  code,
  primary,
  secondary,
  busy,
  pending,
  confirmCancel,
  onRun,
  onNo,
}: {
  code: string;
  primary: Decision;
  secondary: Decision;
  busy: boolean;
  pending: Decision | null;
  confirmCancel: boolean;
  onRun: (d: Decision) => void;
  onNo: () => void;
}) {
  const btn = `flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-60 lg:h-[46px] ${focusRing}`;
  const label = (d: Decision) =>
    pending === d ? (
      <>
        <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Guardando…
      </>
    ) : (
      <>
        {DECISIONS[d].label}
        <kbd className="hidden rounded border border-current/30 px-1.5 font-sans text-[11px] leading-4 opacity-80 lg:inline">{DECISIONS[d].key}</kbd>
      </>
    );

  if (confirmCancel) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar cancelación">
        <p className="w-full text-[15px] font-bold text-[#0F172A] lg:w-auto lg:pr-2">¿Cancelar {code}?</p>
        <button type="button" disabled={busy} onClick={() => onRun("cancelar")} autoFocus className={`${btn} flex-1 bg-[#B91C1C] text-white hover:bg-[#991B1B] lg:flex-none`}>
          {pending === "cancelar" ? label("cancelar") : "Sí, cancelar"}
        </button>
        <button type="button" disabled={busy} onClick={onNo} className={`${btn} flex-1 border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC] lg:flex-none`}>
          No
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
      <button type="button" disabled={busy} onClick={() => onRun(primary)} className={`${btn} bg-[#4F46E5] text-white hover:bg-[#4338CA]`}>
        {label(primary)}
      </button>
      <button type="button" disabled={busy} onClick={() => onRun(secondary)} className={`${btn} border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC]`}>
        {label(secondary)}
      </button>
    </div>
  );
}
