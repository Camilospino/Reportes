"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Search, TriangleAlert } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { initials } from "@/components/header-nav";
import { PLAZO_STYLE, PlazoTag } from "@/components/plazo-tag";
import { TYPE_STYLE, TypeTag } from "@/components/type-tag";
import { ORDER_TYPE_SLUG, PRIORITY_LABEL, STATUS_LABEL, reportCode } from "@/domain/labels";
import type { ReportSort } from "@/domain/schemas";
import { RULES } from "@/domain/report-state";
import { ORDER_TYPES, PRIORITIES, REPORT_STATUSES, type OrderType, type Priority, type ReportStatus } from "@/domain/types";
import { NIVELES_PLAZO, NIVEL_LABEL, type NivelPlazo } from "@/lib/plazo";
import { NETWORK_ERROR_MSG, newId, withRetry } from "@/lib/client-utils";
import { adminDecisionAction, assignTechnicianAction } from "../actions";
import { ReportPanel, type AdminTransition } from "./report-panel";
import { PriorityBars, STATUS_COLORS, StatusPill, type ReportRow } from "./report-row";

export type { ReportRow };

type Filters = {
  estado?: string;
  prioridad?: string;
  tecnico?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  tipo?: string;
  plazo?: string;
  orden: ReportSort;
};

const DEFAULT_SORT: ReportSort = "vence-asc";
const TYPE_TABS: { slug?: string; label: string; type?: OrderType }[] = [
  { label: "Todos" },
  { slug: ORDER_TYPE_SLUG.DANO, label: "Daños", type: "DANO" },
  { slug: ORDER_TYPE_SLUG.INSTALACION, label: "Instalaciones", type: "INSTALACION" },
  { slug: ORDER_TYPE_SLUG.RETIRO, label: "Retiros", type: "RETIRO" },
];

type Override = { status?: ReportStatus; assignedToId?: string | null; assignedName?: string | null };
type Toast = { text: string; error?: boolean; key: number };

/**
 * Lista de reportes del administrador: filtros al instante (en la URL, sin agregar historial),
 * tarjetas de estado, tabla ordenable y panel lateral para asignar técnico o decidir el estado.
 */
export function ReportsBrowser({
  rows,
  counts,
  typeCounts,
  levelCounts,
  now,
  total,
  page,
  pageCount,
  filters,
  technicians,
}: {
  rows: ReportRow[];
  counts: Record<ReportStatus, number>;
  typeCounts: Record<OrderType, number>;
  levelCounts: Record<NivelPlazo, number>;
  /** Hora del servidor al pintar (las etiquetas de plazo se recalculan solas cada minuto). */
  now: number;
  total: number;
  page: number;
  pageCount: number;
  filters: Filters;
  technicians: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(filters.q ?? "");
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const codeButtons = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);

  // Datos nuevos del servidor: ya traen los cambios guardados, se descartan los optimistas.
  useEffect(() => setOverrides({}), [rows]);
  // Si la búsqueda cambia desde afuera (p. ej. "Limpiar filtros"), se sincroniza el campo.
  useEffect(() => setSearch(filters.q ?? ""), [filters.q]);

  /** Cambia filtros en la URL con router.replace (sin entradas nuevas en el historial). */
  function setParams(patch: Partial<Record<keyof Filters, string | undefined>>) {
    const sp = new URLSearchParams();
    const next = { ...filters, ...patch };
    for (const [k, v] of Object.entries(next)) if (v && !(k === "orden" && v === DEFAULT_SORT)) sp.set(k, v);
    const qs = sp.toString();
    startNavigation(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Búsqueda: se aplica 300 ms después de dejar de escribir.
  useEffect(() => {
    if ((filters.q ?? "") === search.trim()) return;
    const t = setTimeout(() => setParams({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 4000 : 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const hasFilters = Boolean(
    filters.estado || filters.prioridad || filters.tecnico || filters.desde || filters.hasta || filters.q || filters.tipo || filters.plazo,
  );
  const view = rows.map((r) => ({ ...r, ...overrides[r.id] }));
  // Si tras un cambio la fila deja de cumplir el filtro (p. ej. verificar con "Realizado" activo),
  // el panel sigue abierto con la última versión conocida en vez de cerrarse solo.
  const [openSnapshot, setOpenSnapshot] = useState<ReportRow | null>(null);
  const liveOpen = view.find((r) => r.id === openId) ?? null;
  useEffect(() => {
    if (liveOpen) setOpenSnapshot(liveOpen);
  }, [JSON.stringify(liveOpen)]);
  const openRow = liveOpen ?? (openSnapshot?.id === openId ? { ...openSnapshot, ...overrides[openSnapshot.id] } : null);

  function clearFilters() {
    setSearch("");
    startNavigation(() => router.replace(pathname, { scroll: false }));
  }

  function sortBy(field: "codigo" | "prioridad" | "creado" | "vence") {
    const [current, dir] = filters.orden.split("-") as [string, "asc" | "desc"];
    // "Vence" empieza por lo más próximo (asc); los demás, por lo más reciente o urgente (desc).
    const first = field === "vence" ? "asc" : "desc";
    const next = current === field ? (dir === "asc" ? "desc" : "asc") : first;
    setParams({ orden: `${field}-${next}` });
  }

  function flash(id: string) {
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(id));
    setTimeout(() => setFlashId((v) => (v === id ? null : v)), 1600);
  }

  function openPanel(r: ReportRow) {
    setOpenSnapshot(r);
    setOpenId(r.id);
  }

  function closePanel() {
    const id = openId;
    setOpenId(null);
    setOpenSnapshot(null);
    // El foco vuelve a la fila; si ya no está en la lista, al buscador.
    requestAnimationFrame(() => (codeButtons.current.get(id ?? "") ?? searchInput.current)?.focus());
  }

  /** Decisión del admin (verificar, rechazar, reprogramar, cancelar): optimista y revierte si falla. */
  async function decide(row: ReportRow, transition: AdminTransition, comment: string): Promise<string | null> {
    const to = RULES[transition].to;
    setOverrides((o) => ({ ...o, [row.id]: { ...o[row.id], status: to } }));
    flash(row.id);
    try {
      const res = await withRetry(() =>
        adminDecisionAction({ transition, reportId: row.id, requestId: newId(), comment: comment || undefined }),
      );
      if (!res.ok) throw new Error(res.fieldErrors?.comment?.[0] ?? res.error);
      setToast({ text: `Estado: ${STATUS_LABEL[to]}`, key: Date.now() });
      return null;
    } catch (e) {
      revert(row.id, "status");
      const msg = e instanceof Error && e.message !== "Failed to fetch" ? e.message : NETWORK_ERROR_MSG;
      setToast({ text: msg, error: true, key: Date.now() });
      return msg;
    }
  }

  async function assign(row: ReportRow, technicianId: string | null) {
    const name = technicianId ? (technicians.find((t) => t.id === technicianId)?.name ?? null) : null;
    setOverrides((o) => ({ ...o, [row.id]: { ...o[row.id], assignedToId: technicianId, assignedName: name } }));
    flash(row.id);
    try {
      const res = await withRetry(() =>
        assignTechnicianAction({ reportId: row.id, assignedToId: technicianId, version: row.version }),
      );
      if (!res.ok) throw new Error(res.error);
      setToast({ text: name ? `Asignado a ${name}` : "Sin técnico asignado", key: Date.now() });
    } catch (e) {
      revert(row.id, "assignedToId", "assignedName");
      setToast({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : NETWORK_ERROR_MSG, error: true, key: Date.now() });
    }
  }

  function revert(id: string, ...fields: (keyof Override)[]) {
    setOverrides((o) => {
      const copy = { ...o[id] };
      for (const f of fields) delete copy[f];
      return { ...o, [id]: copy };
    });
  }

  const allCount = REPORT_STATUSES.reduce((n, s) => n + counts[s], 0);
  const allTypes = ORDER_TYPES.reduce((n, t) => n + typeCounts[t], 0);
  const sortState = (field: string): "ascending" | "descending" | "none" => {
    const [f, d] = filters.orden.split("-");
    return f === field ? (d === "asc" ? "ascending" : "descending") : "none";
  };
  const control =
    "h-10 rounded-[9px] border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,.18)]";

  return (
    <div className="flex flex-col gap-[18px] pb-12 md:pt-4">
      <header>
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px] text-[#0F172A]">Reportes</h1>
        <p className="text-sm text-[#64748B]" aria-live="polite">
          {total} reporte{total === 1 ? "" : "s"}
          {hasFilters ? " con los filtros actuales" : ""}
        </p>
      </header>

      {/* 0. Pestañas por tipo de orden (?tipo=). El número respeta los demás filtros. */}
      <div role="tablist" aria-label="Tipo de orden" className="flex gap-1 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white p-1">
        {TYPE_TABS.map((t) => {
          const active = (filters.tipo ?? undefined) === t.slug;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setParams({ tipo: t.slug })}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-bold whitespace-nowrap ${
                active ? "bg-[#0F172A] text-white" : "text-[#475569] hover:bg-[#F1F5F9]"
              }`}
            >
              {t.type ? <TypeIcon type={t.type} active={active} /> : null}
              {t.label}
              <span className={`text-xs tabular-nums ${active ? "text-[#E2E8F0]" : "text-[#64748B]"}`}>{t.type ? typeCounts[t.type] : allTypes}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Tarjetas de estado (también filtran). El número respeta los demás filtros. */}
      <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4" role="group" aria-label="Filtrar por estado">
        {([null, ...REPORT_STATUSES] as (ReportStatus | null)[]).map((s) => {
          const selected = (filters.estado ?? null) === s;
          return (
            <button
              key={s ?? "todos"}
              type="button"
              aria-pressed={selected}
              onClick={() => setParams({ estado: s ?? undefined })}
              className={`rounded-xl border-2 bg-white px-4 py-3.5 text-left transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                selected ? "border-[#2563EB] shadow-[0_0_0_4px_rgba(37,99,235,.12)]" : "border-[#E2E8F0]"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-bold text-[#475569]">
                <span className="size-2 rounded-full" style={{ background: s ? STATUS_COLORS[s].dot : "#0F172A" }} aria-hidden />
                {s ? STATUS_LABEL[s] : "Todos"}
              </span>
              <span className="block text-[30px] leading-tight font-extrabold text-[#0F172A]">{s ? counts[s] : allCount}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Filtros: se aplican al instante */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white p-3" role="search">
        <div className="relative min-w-60 flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#64748B]" aria-hidden />
          <input
            ref={searchInput}
            type="search"
            aria-label="Buscar reportes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, contrato, dirección o barrio…"
            className={`${control} w-full pl-9`}
          />
        </div>
        <div className="flex rounded-[9px] bg-[#F1F5F9] p-[3px]" role="group" aria-label="Prioridad">
          {([undefined, ...PRIORITIES] as (Priority | undefined)[]).map((p) => {
            const on = filters.prioridad === p;
            return (
              <button
                key={p ?? "todas"}
                type="button"
                aria-pressed={on}
                onClick={() => setParams({ prioridad: p })}
                className={`h-[34px] rounded-[7px] px-3 text-sm font-semibold ${
                  on ? "bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,.12)]" : "text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                {p ? PRIORITY_LABEL[p] : "Todas"}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap rounded-[9px] bg-[#F1F5F9] p-[3px]" role="group" aria-label="Plazo">
          {([undefined, ...NIVELES_PLAZO] as (NivelPlazo | undefined)[]).map((n) => {
            const on = filters.plazo === n;
            return (
              <button
                key={n ?? "todos"}
                type="button"
                aria-pressed={on}
                onClick={() => setParams({ plazo: n })}
                className={`flex h-[34px] items-center gap-1.5 rounded-[7px] px-2.5 text-sm font-semibold whitespace-nowrap ${
                  on ? "bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,.12)]" : "text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                {n ? <span className="size-2 rounded-full" style={{ background: PLAZO_STYLE[n].icon }} aria-hidden /> : null}
                {n ? NIVEL_LABEL[n] : "Todo plazo"}
                {n ? <span className="text-xs text-[#64748B] tabular-nums">{levelCounts[n]}</span> : null}
              </button>
            );
          })}
        </div>
        <select aria-label="Técnico" value={filters.tecnico ?? ""} onChange={(e) => setParams({ tecnico: e.target.value || undefined })} className={control}>
          <option value="">Todos los técnicos</option>
          <option value="sin">Sin asignar</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#475569]">
          Desde
          <input type="date" value={filters.desde ?? ""} onChange={(e) => setParams({ desde: e.target.value || undefined })} className={control} />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#475569]">
          Hasta
          <input type="date" value={filters.hasta ?? ""} onChange={(e) => setParams({ hasta: e.target.value || undefined })} className={control} />
        </label>
        {hasFilters ? (
          <button type="button" onClick={clearFilters} className="flex h-10 items-center px-2 text-sm font-bold text-[#2563EB] hover:underline">
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {/* 3. Tabla */}
      <div
        className={`overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white transition-opacity ${navigating ? "opacity-60" : ""}`}
        aria-busy={navigating}
      >
        {view.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Search size={32} className="text-[#94A3B8]" aria-hidden />
            <p className="text-base font-bold text-[#0F172A]">No hay reportes con estos filtros</p>
            {hasFilters ? (
              <button type="button" onClick={clearFilters} className="btn btn-secondary">
                Limpiar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <table className="w-full min-w-[1240px] border-collapse text-left">
            <thead>
              <tr className="h-11 bg-[#F8FAFC] text-xs font-bold tracking-[.4px] text-[#64748B] uppercase">
                <SortHeader label="Código" state={sortState("codigo")} onClick={() => sortBy("codigo")} />
                <th className="px-[18px]">Dirección</th>
                <th className="px-[18px]">Tipo</th>
                <SortHeader label="Plazo" state={sortState("vence")} onClick={() => sortBy("vence")} />
                <SortHeader label="Prioridad" state={sortState("prioridad")} onClick={() => sortBy("prioridad")} />
                <th className="px-[18px]">Estado</th>
                <th className="px-[18px]">Técnico</th>
                <SortHeader label="Creado" state={sortState("creado")} onClick={() => sortBy("creado")} />
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openPanel(r)}
                  className={`group cursor-pointer border-b border-[#F1F5F9] hover:bg-[#F8FAFC] ${
                    flashId === r.id ? "animate-[row-flash_1.6s_ease-out] motion-reduce:animate-none" : ""
                  }`}
                >
                  <td className="px-[18px] py-3.5">
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) codeButtons.current.set(r.id, el);
                        else codeButtons.current.delete(r.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPanel(r);
                      }}
                      aria-label={`Ver ${reportCode(r.code)}`}
                      className="min-h-10 text-[13px] font-bold whitespace-nowrap text-[#1D4ED8] [font-family:var(--font-code)] group-hover:underline"
                    >
                      {reportCode(r.code)}
                    </button>
                  </td>
                  <td className="max-w-[320px] px-[18px] py-3.5">
                    <p className="truncate text-[15px] font-semibold text-[#0F172A]">{r.street}</p>
                    <p className="truncate text-[13px] text-[#64748B]">
                      {r.neighborhood} · {r.city}
                    </p>
                  </td>
                  <td className="max-w-[220px] px-[18px] py-3.5">
                    <TypeTag type={r.type} />
                    <p className="mt-1 truncate text-[13px] text-[#334155]">{r.summary}</p>
                  </td>
                  <td className="px-[18px] py-3.5">
                    <PlazoTag order={r} now={now} />
                  </td>
                  <td className="px-[18px] py-3.5">
                    <PriorityBars priority={r.priority} />
                  </td>
                  <td className="px-[18px] py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-[18px] py-3.5">
                    <Technician name={r.assignedName} />
                  </td>
                  <td className="px-[18px] py-3.5 whitespace-nowrap">
                    <p className="text-sm font-semibold text-[#0F172A]">{r.createdDay}</p>
                    <p className="text-[13px] text-[#64748B]">{r.createdTime}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {view.length ? <p className="-mt-2 text-[13px] text-[#64748B]">Toque una fila para ver el detalle, asignar técnico o cambiar el estado.</p> : null}

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath={pathname}
        params={{ ...filters, orden: filters.orden === DEFAULT_SORT ? undefined : filters.orden }}
      />

      {/* 4. Panel de detalle */}
      {openRow ? (
        <ReportPanel
          key={openRow.id}
          row={openRow}
          now={now}
          technicians={technicians}
          onClose={closePanel}
          onDecide={(t, comment) => decide(openRow, t, comment)}
          onAssign={(id) => assign(openRow, id)}
        />
      ) : null}

      {toast ? (
        <div
          key={toast.key}
          role="status"
          className="fixed bottom-[calc(110px+env(safe-area-inset-bottom))] left-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-xl bg-[#0F172A] px-4 py-3 text-sm text-white shadow-lg md:bottom-6 md:left-6"
        >
          {toast.error ? (
            <TriangleAlert size={18} className="shrink-0 text-[#FCA5A5]" aria-hidden />
          ) : (
            <Check size={18} strokeWidth={3} className="shrink-0 text-[#4ADE80]" aria-hidden />
          )}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function TypeIcon({ type, active }: { type: OrderType; active: boolean }) {
  const { Icon, text } = TYPE_STYLE[type];
  return <Icon size={16} strokeWidth={2.4} aria-hidden style={{ color: active ? "#FFFFFF" : text }} />;
}

function SortHeader({ label, state, onClick }: { label: string; state: "ascending" | "descending" | "none"; onClick: () => void }) {
  return (
    <th className="px-[18px]" aria-sort={state}>
      <button type="button" onClick={onClick} className="flex h-11 items-center gap-1.5 uppercase hover:text-[#0F172A]">
        {label}
        <span aria-hidden className={state === "none" ? "text-[#94A3B8]" : "text-[#2563EB]"}>
          {state === "none" ? "↕" : state === "ascending" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function Technician({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="flex items-center gap-2 text-sm text-[#64748B]">
        <span className="flex size-[30px] items-center justify-center rounded-full border-2 border-dashed border-[#CBD5E1] text-xs font-bold" aria-hidden>
          ?
        </span>
        Sin asignar
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm text-[#0F172A]">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#E0E7FF] text-xs font-bold text-[#3730A3]" aria-hidden>
        {initials(name)}
      </span>
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
}

