"use client";

import { useEffect, useEffectEvent, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, LoaderCircle, Settings } from "lucide-react";
import { plazoStyle } from "@/components/plazo-tag";
import { TypeTag } from "@/components/type-tag";
import { ORDER_TYPE_SHORT, ORDER_TYPE_SLUG, STATUS_LABEL, reportCode } from "@/domain/labels";
import { ORDER_TYPES, REPORT_STATUSES, type ActionResult, type OrderType, type ReportStatus } from "@/domain/types";
import { newId, withRetry } from "@/lib/client-utils";
import { plazoDeOrden, plazoHoras, type Plazo } from "@/lib/plazo";
import { useNow } from "@/lib/use-now";
import { assignTechnicianAction, cancelarReporte, devolverReporte, reprogramarReporte, verificarReporte } from "../actions";
import { manrope, panelMono } from "../fonts";

export type PanelOrder = {
  id: string;
  code: number;
  type: OrderType;
  street: string;
  neighborhood: string;
  city: string;
  status: ReportStatus;
  version: number;
  assignedToId: string | null;
  technician: string | null;
  createdAt: Date;
  dueAt: Date;
  warnFromHours: number;
  completedAt: Date | null;
  /** Retiro con algún equipo no recibido. */
  pendingPickup: boolean;
};

export type StatusTypeCount = { status: ReportStatus; type: OrderType; count: number };
export type Compliance = { type: OrderType; total: number; onTime: number; percent: number | null }[];

type Decision = "verificar" | "devolver" | "reprogramar" | "cancelar";
type Op = { kind: Decision; id: string } | { kind: "reasignar"; id: string; technicianId: string; technicianName: string };
type State = { orders: PanelOrder[]; counts: StatusTypeCount[] };
type LaneId = "vencidas" | "riesgo" | "verificar";
type Toast = { text: string; error?: boolean; key: number };

const TOAST_MS = 3000;
const REFRESH_MS = 5 * 60_000;
const OFFLINE_MSG = "Sin conexión. Intente de nuevo.";

/** Punto de cada estado en la cabecera oscura (tonos claros: contraste AA sobre #1E293B). */
const STATUS_DOT: Record<ReportStatus | "TODOS", string> = {
  TODOS: "#F8FAFC",
  PENDIENTE: "#60A5FA",
  EN_PROCESO: "#A78BFA",
  REALIZADO: "#4ADE80",
  APLAZADO: "#FBBF24",
  CLIENTE_AUSENTE: "#FB923C",
  VERIFICADO: "#2DD4BF",
  CANCELADO: "#94A3B8",
};

const LANES: Record<LaneId, { title: string; empty: string; line: string; iconBg: string; iconColor: string; Icon: typeof Clock }> = {
  vencidas: {
    title: "Vencidas",
    empty: "Ninguna vencida. Bien.",
    line: "#DC2626",
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
    Icon: AlertTriangle,
  },
  riesgo: {
    title: "Atención y por vencer",
    empty: "Nada en riesgo por ahora.",
    line: "#EAB308",
    iconBg: "#FEF9C3",
    iconColor: "#A16207",
    Icon: Clock,
  },
  verificar: {
    title: "Listas para verificar",
    empty: "No hay trabajos por confirmar.",
    line: "#16A34A",
    iconBg: "#DCFCE7",
    iconColor: "#15803D",
    Icon: CheckCircle2,
  },
};

const DECISIONS: Record<Decision, { action: (input: unknown) => Promise<ActionResult>; to: ReportStatus }> = {
  verificar: { action: verificarReporte, to: "VERIFICADO" },
  devolver: { action: devolverReporte, to: "PENDIENTE" },
  reprogramar: { action: reprogramarReporte, to: "PENDIENTE" },
  cancelar: { action: cancelarReporte, to: "CANCELADO" },
};

const TYPE_TABS: { type: OrderType | null; label: string }[] = [
  { type: null, label: "Todos" },
  { type: "DANO", label: "Daños" },
  { type: "INSTALACION", label: "Instalaciones" },
  { type: "RETIRO", label: "Retiros" },
];

const focusDark = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8FAFC]";
const focusLight = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";

/** Mueve una orden de estado en los conteos (para la actualización optimista). */
function moveCount(counts: StatusTypeCount[], type: OrderType, from: ReportStatus, to: ReportStatus): StatusTypeCount[] {
  if (from === to) return counts;
  const next = counts.map((c) => (c.type === type && c.status === from ? { ...c, count: Math.max(0, c.count - 1) } : c));
  const target = next.find((c) => c.type === type && c.status === to);
  return target ? next.map((c) => (c === target ? { ...c, count: c.count + 1 } : c)) : [...next, { status: to, type, count: 1 }];
}

function applyOp(state: State, op: Op): State {
  const order = state.orders.find((o) => o.id === op.id);
  if (!order) return state;
  if (op.kind === "reasignar") {
    return {
      ...state,
      orders: state.orders.map((o) => (o.id === op.id ? { ...o, assignedToId: op.technicianId, technician: op.technicianName, version: o.version + 1 } : o)),
    };
  }
  const to = DECISIONS[op.kind].to;
  const counts = moveCount(state.counts, order.type, order.status, to);
  // Verificar y cancelar la sacan de los carriles. Devolver y reprogramar la dejan Pendiente con su
  // MISMO plazo (dueAt): calcularPlazo decide en qué carril queda (una vencida sigue en Vencidas).
  if (to === "VERIFICADO" || to === "CANCELADO") return { orders: state.orders.filter((o) => o.id !== op.id), counts };
  return { orders: state.orders.map((o) => (o.id === op.id ? { ...o, status: to, completedAt: null } : o)), counts };
}

/** Carril de una orden con la hora dada; null = activa a tiempo (no entra en los carriles). */
function laneOf(o: PanelOrder, p: Plazo): LaneId | null {
  if (o.status === "REALIZADO") return "verificar";
  if (p.nivel === "vencido") return "vencidas";
  if (p.nivel === "atencion" || p.nivel === "por-vencer") return "riesgo";
  return null;
}

/**
 * Panel de prioridades: cabecera con los números generales y tres carriles por urgencia
 * (Vencidas · Atención y por vencer · Listas para verificar). El carril de cada orden lo calcula
 * calcularPlazo con la hora actual, que se renueva cada minuto: una orden que cruza un umbral se
 * cambia de carril sola. Las decisiones se ven al instante (useOptimistic) y las Server Actions
 * existentes guardan y revalidan con datos reales.
 */
export function PrioridadesPanel({
  orders,
  counts,
  compliance,
  technicians,
  plazoLabel,
  warnLabel,
  now: serverNow,
  initialType,
}: {
  orders: PanelOrder[];
  counts: StatusTypeCount[];
  compliance: Compliance;
  technicians: { id: string; name: string }[];
  /** "plazo de 72 h por orden" o "plazo según el tipo". */
  plazoLabel: string;
  /** Ayuda del carril 2: "Llevan más de 24 h abiertas." */
  warnLabel: string;
  now: number;
  initialType: OrderType | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = useMemo<State>(() => ({ orders, counts }), [orders, counts]);
  const [state, addOptimistic] = useOptimistic(base, applyOp);
  const [acting, startAction] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<OrderType | null>(initialType);
  const [toast, setToast] = useState<Toast | null>(null);
  const now = useNow(serverNow);
  const busy = acting || pendingId !== null;

  // El tipo vive en la URL (?tipo=), con router.replace y sin scroll. Se espera a que no haya una
  // acción en curso: navegar durante una Server Action descarta su respuesta revalidada.
  useEffect(() => {
    if (busy) return;
    const url = typeFilter ? `${pathname}?tipo=${ORDER_TYPE_SLUG[typeFilter]}` : pathname;
    if (url !== `${window.location.pathname}${window.location.search}`) router.replace(url, { scroll: false });
  }, [typeFilter, busy, pathname, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // Cambios de otros usuarios: se traen cada 5 minutos (si la pestaña está a la vista y no hay nada a medias).
  const refresh = useEffectEvent(() => {
    if (document.visibilityState === "visible" && !busy) router.refresh();
  });
  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Carriles con la hora actual.
  const at = new Date(now);
  const lanes: Record<LaneId, { order: PanelOrder; plazo: Plazo }[]> = { vencidas: [], riesgo: [], verificar: [] };
  const inLanesByType: Record<OrderType, number> = { DANO: 0, INSTALACION: 0, RETIRO: 0 };
  let onTime = 0;
  for (const o of state.orders) {
    const plazo = plazoDeOrden(o, at);
    const lane = laneOf(o, plazo);
    if (lane) inLanesByType[o.type] += 1;
    if (typeFilter && o.type !== typeFilter) continue;
    if (lane) lanes[lane].push({ order: o, plazo });
    else onTime += 1;
  }
  // Más horas primero; en "Listas para verificar", la que lleva más tiempo esperando.
  lanes.vencidas.sort((a, b) => b.plazo.horasTranscurridas - a.plazo.horasTranscurridas);
  lanes.riesgo.sort((a, b) => b.plazo.horasTranscurridas - a.plazo.horasTranscurridas);
  lanes.verificar.sort((a, b) => new Date(a.order.completedAt ?? 0).getTime() - new Date(b.order.completedAt ?? 0).getTime());

  const statusCount = (s: ReportStatus) => state.counts.filter((c) => c.status === s && (!typeFilter || c.type === typeFilter)).reduce((n, c) => n + c.count, 0);
  const allCount = REPORT_STATUSES.reduce((n, s) => n + statusCount(s), 0);
  const tabCount = (t: OrderType | null) => (t ? inLanesByType[t] : ORDER_TYPES.reduce((n, x) => n + inLanesByType[x], 0));

  function run(op: Op, order: PanelOrder) {
    if (busy) return;
    const code = reportCode(order.code);
    if (!navigator.onLine) {
      setToast({ text: OFFLINE_MSG, error: true, key: Date.now() });
      return;
    }
    setPendingId(order.id);
    const requestId = newId(); // mismo id en los reintentos: el servidor no duplica la decisión
    startAction(async () => {
      addOptimistic(op);
      let res: { ok: true } | { ok: false; error: string };
      try {
        res =
          op.kind === "reasignar"
            ? await withRetry(() => assignTechnicianAction({ reportId: order.id, assignedToId: op.technicianId, version: order.version }), { attempts: 3 })
            : await withRetry(() => DECISIONS[op.kind].action({ id: order.id, requestId }), { attempts: 3 });
      } catch {
        res = { ok: false, error: OFFLINE_MSG };
      }
      setPendingId(null);
      if (res.ok) {
        setToast({ text: successText(op, code, order), key: Date.now() });
      } else {
        // El estado optimista se descarta solo al terminar la transición; se traen los datos reales.
        setToast({ text: res.error, error: true, key: Date.now() });
        router.refresh();
      }
    });
  }

  return (
    <div className={`${manrope.className} text-[#0F172A]`}>
      <Header
        typeFilter={typeFilter}
        onType={setTypeFilter}
        tabCount={tabCount}
        statusCount={statusCount}
        allCount={allCount}
        compliance={compliance}
        plazoLabel={plazoLabel}
      />

      <div className="mx-auto grid max-w-[1300px] gap-6 px-4 pt-5 pb-8 lg:grid-cols-3 lg:gap-[18px] lg:px-7 lg:pt-6">
        {(Object.keys(LANES) as LaneId[]).map((id) => (
          <Lane
            key={id}
            id={id}
            help={id === "vencidas" ? "Pasaron el plazo. Reprograme, reasigne o cancele hoy." : id === "riesgo" ? warnLabel : "El técnico las marcó como realizadas."}
            items={lanes[id]}
            footer={
              id === "riesgo" ? (
                <Link
                  href={`/admin/reportes?plazo=a-tiempo${typeFilter ? `&tipo=${ORDER_TYPE_SLUG[typeFilter]}` : ""}`}
                  className={`mt-1 inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-[#475569] underline-offset-2 hover:text-[#0F172A] hover:underline ${focusLight}`}
                >
                  {onTime} {onTime === 1 ? "orden a tiempo" : "órdenes a tiempo"} · ver en la lista
                </Link>
              ) : null
            }
            renderCard={(order, plazo, index) => (
              <OrderCard
                key={order.id}
                order={order}
                plazo={plazo}
                lane={id}
                index={index}
                technicians={technicians}
                busy={busy}
                pending={pendingId === order.id}
                onDecide={(kind) => run({ kind, id: order.id }, order)}
                onReassign={(t) => run({ kind: "reasignar", id: order.id, technicianId: t.id, technicianName: t.name }, order)}
              />
            )}
          />
        ))}
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex justify-center md:bottom-8">
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

function successText(op: Op, code: string, order: PanelOrder): string {
  switch (op.kind) {
    case "verificar":
      return `${code} verificado`;
    case "cancelar":
      return `${code} cancelado`;
    case "reasignar":
      return `${code} asignado a ${op.technicianName}`;
    default:
      return `${code} vuelve a Pendiente${order.technician ? ` con ${order.technician}` : ""} (el plazo sigue corriendo)`;
  }
}

// ─── Cabecera oscura ───────────────────────────────────────────────────

function Header({
  typeFilter,
  onType,
  tabCount,
  statusCount,
  allCount,
  compliance,
  plazoLabel,
}: {
  typeFilter: OrderType | null;
  onType: (t: OrderType | null) => void;
  tabCount: (t: OrderType | null) => number;
  statusCount: (s: ReportStatus) => number;
  allCount: number;
  compliance: Compliance;
  plazoLabel: string;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = TYPE_TABS.findIndex((t) => t.type === typeFilter);

  // Flechas izquierda/derecha cambian de pestaña (patrón ARIA de pestañas).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = (activeIndex + (e.key === "ArrowRight" ? 1 : TYPE_TABS.length - 1)) % TYPE_TABS.length;
    onType(TYPE_TABS[next]!.type);
    tabs.current[next]?.focus();
  }

  // Cumplimiento: del tipo elegido, o de todos.
  const shown = typeFilter ? compliance.filter((c) => c.type === typeFilter) : compliance;
  const total = shown.reduce((n, c) => n + c.total, 0);
  const ok = shown.reduce((n, c) => n + c.onTime, 0);
  const percent = total ? Math.round((ok / total) * 100) : null;

  return (
    <header className="-mx-4 -mt-5 bg-[#0F172A] text-[#F8FAFC] lg:-mx-7">
      <div className="mx-auto max-w-[1300px] space-y-5 px-4 py-6 lg:px-7">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.4px]">Panel de prioridades</h1>
            <p className="mt-1 text-sm text-[#94A3B8]">Lo más urgente a la izquierda · {plazoLabel}</p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div
              role="tablist"
              aria-label="Tipo de orden"
              onKeyDown={onKeyDown}
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-[#1E293B] p-1 sm:flex-none"
            >
              {TYPE_TABS.map((t, i) => {
                const active = t.type === typeFilter;
                return (
                  <button
                    key={t.label}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => onType(t.type)}
                    className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold whitespace-nowrap ${focusDark} ${
                      active ? "bg-[#F8FAFC] text-[#0F172A]" : "text-[#CBD5E1] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {t.label}
                    <span className={`text-xs tabular-nums ${active ? "text-[#475569]" : "text-[#94A3B8]"}`}>{tabCount(t.type)}</span>
                  </button>
                );
              })}
            </div>
            <Link
              href="/admin/ajustes"
              className={`flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[#334155] px-3.5 text-sm font-bold text-[#F8FAFC] hover:bg-[#1E293B] ${focusDark}`}
            >
              <Settings size={16} aria-hidden /> Ajustes
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <section aria-label="Órdenes por estado" className="grid grid-cols-4 gap-2 lg:grid-cols-8">
            {(["TODOS", ...REPORT_STATUSES] as const).map((s) => (
              <div key={s} className="min-w-0 rounded-xl bg-[#1E293B] px-2.5 py-2.5 lg:px-3">
                <p className="flex flex-col items-start gap-1 text-xs leading-4 text-[#94A3B8] lg:flex-row lg:items-center lg:gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[s] }} aria-hidden />
                  <span className="min-h-8 lg:min-h-0 lg:truncate">{s === "TODOS" ? "Todos" : STATUS_LABEL[s]}</span>
                </p>
                <p className="mt-1 text-2xl leading-none font-extrabold tabular-nums">{s === "TODOS" ? allCount : statusCount(s)}</p>
              </div>
            ))}
          </section>

          <section aria-label="Cerradas a tiempo en los últimos 30 días" className="flex items-center gap-4 rounded-xl bg-[#1E293B] px-4 py-3">
            <ComplianceRing percent={percent} />
            <div className="min-w-0">
              <p className="text-xs text-[#94A3B8]">A tiempo · últimos 30 días</p>
              <p className="text-[22px] leading-tight font-extrabold tabular-nums">{percent === null ? "—" : `${percent}%`}</p>
              <p className="text-xs leading-snug text-[#CBD5E1]">
                {compliance
                  .map((c) => `${ORDER_TYPE_SHORT[c.type]} ${c.total ? `${c.onTime}/${c.total}` : "sin cierres"}`)
                  .join(" · ")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </header>
  );
}

/** Anillo de cumplimiento (64 px). Sin cierres: "—" y el anillo vacío. */
function ComplianceRing({ percent }: { percent: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = percent === null ? 0 : (percent / 100) * c;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={percent === null ? "Sin cierres en los últimos 30 días" : `${percent}% cerradas a tiempo en los últimos 30 días`} className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#334155" strokeWidth="7" />
      {filled > 0 ? (
        <circle cx="32" cy="32" r={r} fill="none" stroke="#4ADE80" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
      ) : null}
    </svg>
  );
}

// ─── Carriles y tarjetas ───────────────────────────────────────────────

function Lane({
  id,
  help,
  items,
  footer,
  renderCard,
}: {
  id: LaneId;
  help: string;
  items: { order: PanelOrder; plazo: Plazo }[];
  footer: ReactNode;
  renderCard: (order: PanelOrder, plazo: Plazo, index: number) => ReactNode;
}) {
  const lane = LANES[id];
  const headingId = `lane-${id}`;
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      {/* En celular y tableta el encabezado queda fijo mientras se recorren sus tarjetas. */}
      <div className="sticky top-0 z-10 -mx-1 bg-[#EEF1F5] px-1 pt-1 pb-2.5 md:top-[100px] lg:static lg:bg-transparent">
        <div className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,.06)]">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: lane.iconBg, color: lane.iconColor }}>
            <lane.Icon size={18} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base leading-tight font-extrabold">
              {lane.title}
            </h2>
            <p className="text-[12.5px] leading-snug text-[#475569]">{help}</p>
          </div>
          <span className="text-[22px] font-extrabold tabular-nums" aria-label={`${items.length} órdenes`}>
            {items.length}
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-[#CBD5E1] px-4 py-8 text-center text-sm font-semibold text-[#475569]">{lane.empty}</p>
        ) : (
          items.map((it, i) => renderCard(it.order, it.plazo, i))
        )}
        {footer}
      </div>
    </section>
  );
}

const RING_COLOR: Record<Plazo["nivel"], string> = {
  "a-tiempo": "#16A34A",
  atencion: "#CA8A04",
  "por-vencer": "#EA580C",
  vencido: "#DC2626",
  detenido: "#16A34A",
  "sin-plazo": "#94A3B8",
};

/** Anillo de plazo (56 px): horas usadas sobre el plazo, con tope de 100 %. En Realizadas, hasta realizadoEn. */
function DeadlineRing({ order, plazo }: { order: PanelOrder; plazo: Plazo }) {
  const total = plazoHoras(order);
  const used = Math.max(0, plazo.horasTranscurridas);
  const r = 23;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, total > 0 ? used / total : 1) * c;
  const color = plazo.nivel === "detenido" && plazo.horasRestantes < 0 ? RING_COLOR.vencido : RING_COLOR[plazo.nivel];
  return (
    <div className="relative size-14 shrink-0" role="img" aria-label={`${plazo.texto}: ${Math.floor(used)} de ${Math.round(total)} horas`}>
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#F1F5F9" strokeWidth="6" />
        {filled > 0 ? <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} /> : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden>
        <span className="text-[13px] font-extrabold tabular-nums">{Math.floor(used)} h</span>
        <span className="mt-0.5 text-[8.5px] font-semibold text-[#64748B]">de {Math.round(total)} h</span>
      </span>
    </div>
  );
}

function OrderCard({
  order,
  plazo,
  lane,
  index,
  technicians,
  busy,
  pending,
  onDecide,
  onReassign,
}: {
  order: PanelOrder;
  plazo: Plazo;
  lane: LaneId;
  index: number;
  technicians: { id: string; name: string }[];
  busy: boolean;
  pending: boolean;
  onDecide: (d: Decision) => void;
  onReassign: (t: { id: string; name: string }) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const code = reportCode(order.code);
  const style = plazoStyle(plazo);
  const lineColor = LANES[lane].line;

  const btn = `flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 lg:h-9 ${focusLight}`;
  const secondary = `${btn} border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC]`;
  const spinner = <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />;
  const cancelButton = (
    <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className={secondary}>
      Cancelar
    </button>
  );
  const viewLink = (
    <Link href={`/admin/reportes/${order.id}`} className={secondary}>
      Ver orden
    </Link>
  );

  let buttons: ReactNode;
  if (confirmCancel) {
    buttons = (
      <div className="col-span-2 flex flex-wrap items-center gap-2" role="group" aria-label={`Confirmar cancelación de ${code}`}>
        <p className="flex-1 text-sm font-bold">¿Cancelar {code}?</p>
        <button type="button" autoFocus disabled={busy} onClick={() => onDecide("cancelar")} className={`${btn} bg-[#B91C1C] text-white hover:bg-[#991B1B]`}>
          {pending ? spinner : null}Sí
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className={secondary}>
          No
        </button>
      </div>
    );
  } else if (order.status === "REALIZADO") {
    buttons = (
      <>
        <button type="button" disabled={busy} onClick={() => onDecide("verificar")} className={`${btn} bg-[#047857] text-white hover:bg-[#065F46]`}>
          {pending ? spinner : null}Verificar
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide("devolver")} className={secondary}>
          Devolver
        </button>
      </>
    );
  } else if (order.status === "APLAZADO" || order.status === "CLIENTE_AUSENTE") {
    buttons = (
      <>
        <button type="button" disabled={busy} onClick={() => onDecide("reprogramar")} className={`${btn} bg-[#2563EB] text-white hover:bg-[#1D4ED8]`}>
          {pending ? spinner : null}Reprogramar
        </button>
        {cancelButton}
      </>
    );
  } else if (order.status === "PENDIENTE") {
    // Reasignar usa la acción existente (assignTechnicianAction): solo con la orden Pendiente.
    buttons = (
      <>
        <ReassignMenu
          code={code}
          current={order.assignedToId}
          technicians={technicians}
          busy={busy}
          pending={pending}
          open={menuOpen}
          onOpen={setMenuOpen}
          onPick={(t) => {
            setMenuOpen(false);
            onReassign(t);
          }}
          className={`${btn} w-full bg-[#0F172A] text-white hover:bg-[#1E293B]`}
        />
        {cancelButton}
      </>
    );
  } else {
    // En proceso: el técnico ya la tomó (no se le cambia el técnico); se puede ver o cancelar.
    buttons = (
      <>
        {viewLink}
        {cancelButton}
      </>
    );
  }

  return (
    <article
      // Con el menú de Reasignar abierto, la tarjeta va encima de las siguientes (si no, la tapan).
      className={`${menuOpen ? "relative z-30" : "relative"} animate-[lane-card-in_.35s_ease-out_both] rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[inset_0_3px_0_var(--line)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_3px_0_var(--line),0_10px_24px_rgba(15,23,42,.08)] motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
      style={{ "--line": lineColor, animationDelay: `${Math.min(index, 6) * 40}ms` } as React.CSSProperties}
    >
      <div className="flex gap-3">
        <DeadlineRing order={order} plazo={plazo} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className={`${panelMono.className} text-[11.5px] text-[#64748B]`}>{code}</span>
            <TypeTag type={order.type} />
          </p>
          <h3 className="mt-1 truncate text-[15px] font-extrabold" title={order.street}>
            <Link href={`/admin/reportes/${order.id}`} className={`rounded hover:underline ${focusLight}`}>
              {order.street}
            </Link>
          </h3>
          <p className="truncate text-[12.5px] text-[#64748B]">
            {order.neighborhood}, {order.city}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 font-bold tabular-nums" style={{ backgroundColor: style.bg, color: style.text }}>
          <Clock size={13} strokeWidth={2.4} style={{ color: style.icon }} aria-hidden />
          {plazo.texto}
        </span>
        <span className="text-[12.5px] text-[#475569]">
          {STATUS_LABEL[order.status]} · {order.technician ?? "Sin técnico asignado"}
        </span>
        {order.pendingPickup ? <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-xs leading-5 font-bold text-[#991B1B]">Equipo pendiente</span> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">{buttons}</div>
    </article>
  );
}

/** Menú "Reasignar": los técnicos activos (menos el actual). Se cierra con Escape o al tocar afuera. */
function ReassignMenu({
  code,
  current,
  technicians,
  busy,
  pending,
  open,
  onOpen,
  onPick,
  className,
}: {
  code: string;
  current: string | null;
  technicians: { id: string; name: string }[];
  busy: boolean;
  pending: boolean;
  open: boolean;
  onOpen: (v: boolean) => void;
  onPick: (t: { id: string; name: string }) => void;
  className: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = technicians.filter((t) => t.id !== current);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpen]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        disabled={busy || options.length === 0}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => onOpen(!open)}
        className={className}
      >
        {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        Reasignar <ChevronDown size={16} aria-hidden />
      </button>
      {open ? (
        <ul
          aria-label={`Técnicos para ${code}`}
          className="absolute top-[calc(100%+6px)] left-0 z-20 max-h-64 w-60 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,.16)]"
        >
          {options.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                autoFocus={t === options[0]}
                onClick={() => onPick(t)}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-[#EFF6FF] ${focusLight}`}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
