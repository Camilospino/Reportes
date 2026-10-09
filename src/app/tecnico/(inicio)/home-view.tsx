"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, LoaderCircle, Navigation, Phone, RefreshCw } from "lucide-react";
import { Alert } from "@/components/alert";
import { Pagination } from "@/components/pagination";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, reportCode } from "@/domain/labels";
import { googleMapsUrl, telHref } from "@/domain/text";
import type { ActionResult, DamageCategory, Priority, ReportStatus } from "@/domain/types";
import { newId, withRetry } from "@/lib/client-utils";
import { TIME_ZONE, formatClock, formatShortDateTime } from "@/lib/dates";
import { iniciarReporte, marcarRealizado, tomarReporte } from "../actions";
import { jakarta, jetbrainsMono } from "../fonts";
import { PhotoPicker } from "../photo-picker";

export type HomeTab = "a-mi-cargo" | "disponibles";

export type HomeReport = {
  id: string;
  code: number;
  street: string;
  neighborhood: string;
  city: string;
  category: DamageCategory;
  priority: Priority;
  status: ReportStatus;
  createdAt: Date;
  /** Solo viene en "A mi cargo". */
  clientPhone?: string;
};

type Lists = { mine: HomeReport[]; available: HomeReport[]; availableTotal: number; doneToday: number };
type OpKind = "take" | "start" | "complete";
type Op = { kind: OpKind; report: HomeReport };
type Toast = { text: string; kind: "ok" | "error"; key: number };

const OFFLINE_MSG = "Sin conexión. Intente de nuevo.";
const TOAST_MS = 2400;
const AUTO_REFRESH_MS = 60_000;

const PRIORITY_RANK: Record<Priority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
const PRIORITY_STRIPE: Record<Priority, string> = { ALTA: "#DC2626", MEDIA: "#D97706", BAJA: "#64748B" };
const PRIORITY_PILL: Record<Priority, string> = {
  ALTA: "bg-[#FEE2E2] text-[#991B1B]",
  MEDIA: "bg-[#FEF3C7] text-[#92400E]",
  BAJA: "bg-[#F1F5F9] text-[#334155]",
};
const STATUS_PILL: Partial<Record<ReportStatus, string>> = {
  PENDIENTE: "bg-[#DBEAFE] text-[#1E40AF]",
  EN_PROCESO: "bg-[#EDE9FE] text-[#5B21B6]",
};

const ACTIONS: Record<OpKind, { busy: string; ok: (code: string) => string }> = {
  take: { busy: "Tomando…", ok: (c) => `Tomó ${c}. Ya está a su cargo.` },
  start: { busy: "Iniciando…", ok: (c) => `${c} en proceso.` },
  complete: { busy: "Guardando…", ok: (c) => `${c} realizado. Pasó a Mi historial.` },
};

/** Mismo orden que el servidor: En proceso primero, luego prioridad y antigüedad. */
function sortMine(list: HomeReport[]): HomeReport[] {
  return [...list].sort(
    (a, b) =>
      Number(b.status === "EN_PROCESO") - Number(a.status === "EN_PROCESO") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function applyOp(state: Lists, { kind, report }: Op): Lists {
  const started = { ...report, status: "EN_PROCESO" as const };
  switch (kind) {
    case "take":
      return {
        ...state,
        mine: sortMine([...state.mine.filter((r) => r.id !== report.id), started]),
        available: state.available.filter((r) => r.id !== report.id),
        availableTotal: Math.max(0, state.availableTotal - 1),
      };
    case "start":
      return { ...state, mine: sortMine(state.mine.map((r) => (r.id === report.id ? started : r))) };
    case "complete":
      return { ...state, mine: state.mine.filter((r) => r.id !== report.id), doneToday: state.doneToday + 1 };
  }
}

/** Saludo según la hora de Colombia. */
function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Inicio del técnico ("Pestañas y resumen del día"). Los datos vienen del servidor; cada acción se
 * ve al instante (useOptimistic) y la revalidación de la Server Action trae los datos reales. Si el
 * servidor devuelve error, el estado optimista se descarta solo al terminar la transición.
 */
export function TechnicianHomeView({
  firstName,
  mine,
  available,
  availableTotal,
  doneToday,
  page,
  pageCount,
  initialTab,
  initialToast,
  flash,
}: {
  firstName: string;
  mine: HomeReport[];
  available: HomeReport[];
  availableTotal: number;
  doneToday: number;
  page: number;
  pageCount: number;
  initialTab: HomeTab;
  initialToast: string | null;
  flash: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = useMemo<Lists>(() => ({ mine, available, availableTotal, doneToday }), [mine, available, availableTotal, doneToday]);
  const [lists, addOptimistic] = useOptimistic(base, applyOp);
  const [acting, startAction] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  const [tab, setTab] = useState<HomeTab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(() => (initialTab === "a-mi-cargo" ? mine : available)[0]?.id ?? null);
  const [pending, setPending] = useState<{ id: string; kind: OpKind } | null>(null);
  /** Reportes que otro técnico tomó primero: se ocultan hasta que llegue la lista nueva. */
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [completing, setCompleting] = useState<HomeReport | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(initialToast ? { text: initialToast, kind: "ok", key: 0 } : null);
  // Saludo y hora se calculan en el navegador tras montar (evita diferencias de hidratación).
  const [header, setHeader] = useState<{ greeting: string; loadedAt: string } | null>(null);

  const busy = acting || pending !== null;

  // Cada vez que llegan datos del servidor: hora de la última carga y saludo actualizado.
  useEffect(() => {
    const now = new Date();
    setHeader({ greeting: greetingFor(now), loadedAt: formatClock(now) });
    setGone(new Set());
  }, [base]);

  // El aviso se va solo a los 2.4 s; uno nuevo reemplaza al anterior (y reinicia el tiempo).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const replaceQuery = useCallback(
    (edit: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(window.location.search);
      edit(sp);
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
    },
    [pathname],
  );

  // El aviso que llega por la URL se muestra una sola vez.
  useEffect(() => {
    if (initialToast) replaceQuery((sp) => (sp.delete("msg"), sp.delete("r")));
  }, [initialToast, replaceQuery]);

  // La pestaña vive en la URL (?tab=disponibles) para sobrevivir a una recarga. Se usa replaceState
  // (no router.replace) porque cambiar searchParams con el router vuelve a pedir la página al
  // servidor y muestra el esqueleto de carga. Se espera a que no haya acción en curso: durante una
  // Server Action, un cambio de URL cuenta como navegación y Next descarta la respuesta revalidada.
  useEffect(() => {
    if (busy) return;
    replaceQuery((sp) => (tab === "disponibles" ? sp.set("tab", "disponibles") : sp.delete("tab")));
  }, [tab, busy, replaceQuery]);

  function refresh() {
    startRefresh(() => router.refresh());
  }

  // Actualización automática: cada 60 s y al volver a la pestaña, salvo si hay algo a medias.
  const autoRefresh = useEffectEvent(() => {
    if (document.visibilityState !== "visible" || busy || refreshing || completing) return;
    refresh();
  });
  useEffect(() => {
    const id = setInterval(autoRefresh, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") autoRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function showToast(text: string, kind: Toast["kind"] = "ok") {
    setToast({ text, kind, key: Date.now() });
  }

  /** Ejecuta una acción con actualización optimista. Devuelve el resultado para el panel de cierre. */
  function run(op: Op, extra: { requestId?: string; note?: string; attachmentIds?: string[] } = {}): Promise<ActionResult> {
    const { kind, report } = op;
    const code = reportCode(report.code);
    if (!navigator.onLine) {
      if (kind !== "complete") showToast(OFFLINE_MSG, "error");
      return Promise.resolve({ ok: false, error: OFFLINE_MSG });
    }
    setPending({ id: report.id, kind });
    if (kind === "take") {
      setTab("a-mi-cargo");
      setOpenId(report.id);
    }
    // Mismo id en todos los reintentos: el servidor no duplica el cambio.
    const requestId = extra.requestId ?? newId();
    const call = (): Promise<ActionResult> =>
      kind === "take"
        ? tomarReporte({ reportId: report.id, requestId })
        : kind === "start"
          ? iniciarReporte({ reportId: report.id, requestId })
          : marcarRealizado({ reportId: report.id, requestId, note: extra.note, attachmentIds: extra.attachmentIds });

    return new Promise((resolve) => {
      startAction(async () => {
        addOptimistic(op);
        let res: ActionResult;
        try {
          res = await withRetry(call, { attempts: 3 });
        } catch {
          res = { ok: false, error: OFFLINE_MSG };
        }
        setPending(null);
        if (res.ok) {
          showToast(ACTIONS[kind].ok(code));
        } else {
          // Los errores del cierre se muestran dentro del panel (el aviso lo taparía).
          if (kind !== "complete") showToast(res.error, "error");
          if (kind === "take") {
            setTab("disponibles");
            if (res.error !== OFFLINE_MSG) {
              // Lo tomó otro técnico (o ya no está disponible): fuera de la lista y datos frescos.
              setGone((g) => new Set(g).add(report.id));
              refresh();
            }
          }
        }
        resolve(res);
      });
    });
  }

  async function confirmComplete(input: { requestId: string; note: string; attachmentIds: string[] }) {
    if (!completing) return;
    setSheetError(null);
    const res = await run({ kind: "complete", report: completing }, input);
    if (res.ok) setCompleting(null);
    else setSheetError(res.error);
  }

  const inProgress = lists.mine.filter((r) => r.status === "EN_PROCESO").length;
  const list = tab === "a-mi-cargo" ? lists.mine : lists.available.filter((r) => !gone.has(r.id));

  return (
    <div className={`${jakarta.className} -mx-4 -mt-5 text-[#0F172A] md:mt-0`}>
      {/* 1. Encabezado azul */}
      <header className="rounded-b-[28px] bg-[#2563EB] px-[18px] pt-[22px] pb-[54px] text-white md:rounded-t-[28px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="min-h-5 text-sm text-[#EFF6FF]">{header?.greeting ?? " "}</p>
            <h1 className="truncate text-[26px] leading-tight font-extrabold tracking-[-0.5px]">{firstName}</h1>
          </div>
          <button
            type="button"
            aria-label="Actualizar"
            onClick={refresh}
            disabled={refreshing}
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-white/16 transition-colors hover:bg-white/24 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait"
          >
            <RefreshCw size={20} strokeWidth={2.25} aria-hidden className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />
          </button>
        </div>
        <p className="mt-1 min-h-5 text-[13px] text-[#EFF6FF]">
          {refreshing ? "Actualizando…" : header ? `Actualizado a las ${header.loadedAt}` : " "}
        </p>
      </header>

      <div className="space-y-4 px-4">
        {/* 2. Contadores montados sobre el encabezado */}
        <div className="-mt-10 grid grid-cols-3 gap-2">
          <Counter value={inProgress} label="En curso" color="#7C3AED" />
          <Counter value={lists.availableTotal} label="Disponibles" color="#2563EB" />
          <Counter value={lists.doneToday} label="Hechos hoy" color="#16A34A" />
        </div>

        {flash}

        {/* 3. Pestañas */}
        <Tabs tab={tab} onSelect={setTab} mineCount={lists.mine.length} availableCount={lists.availableTotal} />

        {/* 4–5. Tarjetas o estado vacío */}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-[10px]">
          {list.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            list.map((r, i) => (
              <ReportCard
                key={`${tab}-${r.id}`}
                report={r}
                index={i}
                mode={tab}
                open={openId === r.id}
                busy={busy}
                busyLabel={pending?.id === r.id ? ACTIONS[pending.kind].busy : null}
                onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                onTake={() => void run({ kind: "take", report: r })}
                onStart={() => void run({ kind: "start", report: r })}
                onComplete={() => {
                  setToast(null); // el aviso flotante taparía el panel
                  setSheetError(null);
                  setCompleting(r);
                }}
              />
            ))
          )}
          {tab === "disponibles" ? (
            <Pagination page={page} pageCount={pageCount} basePath="/tecnico" params={{ tab: "disponibles" }} />
          ) : null}
        </div>
      </div>

      {completing ? (
        <CompleteSheet
          key={completing.id}
          report={completing}
          saving={pending?.kind === "complete"}
          error={sheetError}
          onCancel={() => setCompleting(null)}
          onConfirm={confirmComplete}
        />
      ) : null}

      {/* 6. Aviso breve encima de la barra inferior. El contenedor siempre existe para que se anuncie. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(102px+env(safe-area-inset-bottom))] z-[60] flex justify-center md:bottom-6"
      >
        {toast ? (
          <p
            key={toast.key}
            className={`max-w-md animate-[toast-in_.25s_ease-out_both] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,.3)] motion-reduce:animate-none ${
              toast.kind === "error" ? "bg-[#991B1B]" : "bg-[#0F172A]"
            }`}
          >
            {toast.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Counter({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,.08)]">
      <p className="text-[26px] leading-none font-extrabold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1.5 truncate text-xs font-semibold text-[#475569]">{label}</p>
    </div>
  );
}

function Tabs({
  tab,
  onSelect,
  mineCount,
  availableCount,
}: {
  tab: HomeTab;
  onSelect: (t: HomeTab) => void;
  mineCount: number;
  availableCount: number;
}) {
  const items: { id: HomeTab; label: string; count: number }[] = [
    { id: "a-mi-cargo", label: "A mi cargo", count: mineCount },
    { id: "disponibles", label: "Disponibles", count: availableCount },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Flechas izquierda/derecha cambian de pestaña (patrón ARIA de pestañas).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "a-mi-cargo" ? 1 : 0;
    onSelect(items[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Reportes" className="relative grid grid-cols-2 rounded-[14px] bg-[#E2E8F0] p-1" onKeyDown={onKeyDown}>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[10px] bg-white shadow-[0_2px_8px_rgba(15,23,42,.12)] transition-[left] duration-400 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none"
        style={{ left: tab === "a-mi-cargo" ? "4px" : "50%" }}
      />
      {items.map((it, i) => {
        const active = it.id === tab;
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${it.id}`}
            aria-selected={active}
            aria-controls={`panel-${it.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(it.id)}
            className={`relative z-10 flex h-[42px] items-center justify-center gap-2 rounded-[10px] text-sm font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
              active ? "text-[#0F172A]" : "text-[#475569]"
            }`}
          >
            {it.label}
            <span
              className={`min-w-6 rounded-full px-2 py-0.5 text-xs leading-5 font-extrabold ${
                active ? "bg-[#2563EB] text-white" : "bg-[#CBD5E1] text-[#334155]"
              }`}
            >
              {it.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReportCard({
  report,
  index,
  mode,
  open,
  busy,
  busyLabel,
  onToggle,
  onTake,
  onStart,
  onComplete,
}: {
  report: HomeReport;
  index: number;
  mode: HomeTab;
  open: boolean;
  busy: boolean;
  /** Texto de la acción en curso sobre ESTA tarjeta ("Tomando…"), o null. */
  busyLabel: string | null;
  onToggle: () => void;
  onTake: () => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  const bodyId = `card-${mode}-${report.id}`;
  return (
    <article
      className="relative animate-[card-in_.35s_ease-out_both] overflow-hidden rounded-[18px] bg-white shadow-[0_1px_3px_rgba(15,23,42,.08)] motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ backgroundColor: PRIORITY_STRIPE[report.priority] }} />

      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="block w-full py-3.5 pr-4 pl-5 text-left focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-[#2563EB]"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_PILL[report.status] ?? "bg-[#F1F5F9] text-[#334155]"}`}>
            {STATUS_LABEL[report.status]}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_PILL[report.priority]}`}>
            {PRIORITY_LABEL[report.priority]}
          </span>
          <span className={`${jetbrainsMono.className} ml-auto text-[11px] text-[#64748B]`}>{reportCode(report.code)}</span>
          <ChevronDown
            size={20}
            aria-hidden
            className={`shrink-0 text-[#64748B] transition-transform duration-250 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </span>
        <span className="mt-2 block text-lg leading-tight font-extrabold text-[#0F172A]">{report.street}</span>
        <span className="mt-0.5 block text-sm text-[#475569]">{report.neighborhood}</span>
        <span className="mt-1 block text-[13px] text-[#64748B]">
          {CATEGORY_LABEL[report.category]} · {formatShortDateTime(report.createdAt)}
        </span>
      </button>

      {/* Animación de apertura: la fila del grid pasa de 0fr a 1fr. Cerrada queda inerte (sin foco ni lector). */}
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2.5 pr-4 pb-4 pl-5">
            {mode === "a-mi-cargo" ? (
              <MineActions report={report} busy={busy} busyLabel={busyLabel} onStart={onStart} onComplete={onComplete} />
            ) : (
              <>
                <PrimaryButton color="#2563EB" hover="#1D4ED8" busy={busy} busyLabel={busyLabel} onClick={onTake}>
                  Tomar este reporte
                </PrimaryButton>
                <p className="text-center text-xs text-[#64748B]">Al tomarlo, dejará de verse para los demás técnicos.</p>
              </>
            )}
            <Link
              href={`/tecnico/reportes/${report.id}`}
              className="flex min-h-11 items-center justify-center gap-1 rounded-xl text-sm font-bold text-[#1E40AF] hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              Ver detalle completo <ChevronRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

const secondaryBtn =
  "flex h-[46px] items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";

function MineActions({
  report,
  busy,
  busyLabel,
  onStart,
  onComplete,
}: {
  report: HomeReport;
  busy: boolean;
  busyLabel: string | null;
  onStart: () => void;
  onComplete: () => void;
}) {
  const tel = telHref(report.clientPhone);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tel ? (
          <a href={tel} className={secondaryBtn}>
            <Phone size={18} aria-hidden /> Llamar
          </a>
        ) : null}
        <a href={googleMapsUrl(report)} target="_blank" rel="noopener noreferrer" className={`${secondaryBtn} ${tel ? "" : "col-span-2"}`}>
          <Navigation size={18} aria-hidden /> Cómo llegar
        </a>
      </div>
      {report.status === "EN_PROCESO" ? (
        <PrimaryButton color="#15803D" hover="#166534" busy={busy} busyLabel={busyLabel} onClick={onComplete}>
          Marcar realizado
        </PrimaryButton>
      ) : (
        <PrimaryButton color="#7C3AED" hover="#6D28D9" busy={busy} busyLabel={busyLabel} onClick={onStart}>
          Iniciar trabajo
        </PrimaryButton>
      )}
    </>
  );
}

function PrimaryButton({
  color,
  hover,
  busy,
  busyLabel,
  onClick,
  type = "button",
  children,
}: {
  color: string;
  hover: string;
  busy: boolean;
  busyLabel: string | null;
  onClick?: () => void;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={busy}
      onClick={onClick}
      style={{ "--bg": color, "--bg-hover": hover } as React.CSSProperties}
      className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-(--bg) text-[15px] font-extrabold text-white transition-opacity hover:bg-(--bg-hover) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busyLabel ? (
        <>
          <LoaderCircle size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Confirmación de "Marcar realizado" (panel inferior propio). La app exige al menos una foto de
 * evidencia para cerrar, así que el panel la pide junto con la nota de cierre opcional.
 */
function CompleteSheet({
  report,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  report: HomeReport;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: { requestId: string; note: string; attachmentIds: string[] }) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Mismo id mientras el panel esté abierto: si un envío se repite, el servidor no lo duplica.
  const [requestId] = useState(newId);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const onPhotos = useCallback((s: { ids: string[]; busy: boolean }) => setPhotos(s), []);
  const code = reportCode(report.code);
  const cancel = useEffectEvent(() => {
    if (!saving) onCancel();
  });

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const missingPhoto = photos.ids.length === 0;
  const disabled = saving || photos.busy || missingPhoto;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[rgba(15,23,42,.45)]" onClick={cancel} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-lg animate-[sheet-up_.35s_cubic-bezier(.3,1.2,.5,1)] overflow-y-auto rounded-t-[28px] bg-white px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] outline-none motion-reduce:animate-none"
      >
        <span className="mx-auto mb-4 block h-[5px] w-11 rounded-full bg-[#CBD5E1]" aria-hidden />
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) onConfirm({ requestId, note, attachmentIds: photos.ids });
          }}
        >
          <h2 id="complete-title" className="text-lg font-extrabold text-[#0F172A]">
            ¿Marcar {code} como realizado?
          </h2>
          <p className="-mt-2 text-sm text-[#475569]">{report.street}</p>
          <PhotoPicker reportId={report.id} kind="EVIDENCIA" max={10} label="Fotos de evidencia * (mínimo 1)" onChange={onPhotos} />
          <div>
            <label htmlFor="complete-note" className="label">
              Nota de cierre (opcional)
            </label>
            <textarea id="complete-note" className="input min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error ? <Alert kind="error">{error}</Alert> : null}
          {missingPhoto && !photos.busy ? <p className="text-sm font-medium text-amber-800">Tome al menos una foto para poder confirmar.</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className={`${secondaryBtn} h-[50px] text-[15px] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Cancelar
            </button>
            <PrimaryButton type="submit" color="#15803D" hover="#166534" busy={disabled} busyLabel={saving ? "Guardando…" : photos.busy ? "Esperando fotos…" : null}>
              Sí, realizado
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: HomeTab }) {
  const [title, hint] =
    tab === "a-mi-cargo" ? ["Nada a su cargo", "Revise la pestaña Disponibles."] : ["Sin reportes disponibles", "Toque ↻ para buscar nuevos."];
  return (
    <div className="rounded-[18px] bg-white px-4 py-7 text-center">
      <p className="text-base font-extrabold text-[#0F172A]">{title}</p>
      <p className="mt-1 text-sm text-[#475569]">{hint}</p>
    </div>
  );
}
