"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import type { DeadlineThreshold } from "@/domain/types";
import { formatShortDateTime } from "@/lib/dates";
import type { NotificationSummary } from "@/server/notifications";

const POLL_MS = 60_000;

/** Color del aviso según el umbral (mismos tonos que la etiqueta de plazo). */
const LEVEL: Record<DeadlineThreshold, { label: string; dot: string; text: string; bg: string }> = {
  H24: { label: "Atención", dot: "#CA8A04", text: "#854D0E", bg: "#FEFCE8" },
  H48: { label: "Por vencer", dot: "#EA580C", text: "#9A3412", bg: "#FFF7ED" },
  VENCIDO: { label: "Vencido", dot: "#DC2626", text: "#991B1B", bg: "#FEF2F2" },
};

/**
 * Campanita de avisos de plazo. Número rojo con los no leídos; al abrirla, los avisos más recientes
 * primero con su color y enlace a la orden (al tocarlo se marca leído). Se actualiza cada 60 s con
 * un endpoint pequeño (sin websockets).
 */
export function NotificationBell({ initial }: { initial: NotificationSummary }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Datos nuevos del servidor (al navegar): reemplazan a los del sondeo.
  useEffect(() => setData(initial), [initial]);

  const poll = useEffectEvent(async () => {
    if (document.visibilityState !== "visible" || busy) return;
    try {
      const res = await fetch("/api/notificaciones", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as NotificationSummary);
    } catch {
      // Sin señal: se intenta en el próximo ciclo.
    }
  });
  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function mark(body: { id: string } | { all: true }) {
    setBusy(true);
    try {
      const res = await fetch("/api/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setData((await res.json()) as NotificationSummary);
    } catch {
      // Se reintenta solo en el próximo sondeo; la navegación sigue igual.
    } finally {
      setBusy(false);
    }
  }

  function openItem(id: string, href: string, read: boolean) {
    // Optimista: baja el contador al instante.
    if (!read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === id ? { ...i, read: true } : i)) }));
      void mark({ id });
    }
    setOpen(false);
    router.push(href);
  }

  const unread = data.unread;
  const badge = unread > 9 ? "9+" : String(unread);
  const now = new Date();

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
      >
        <Bell size={20} strokeWidth={2} aria-hidden />
        {unread ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[11px] leading-none font-extrabold text-white ring-2 ring-white tabular-nums"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Avisos"
          className="fixed inset-x-3 top-[76px] z-50 flex max-h-[min(70dvh,560px)] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] md:absolute md:inset-x-auto md:top-[calc(100%+18px)] md:right-0 md:w-[380px]"
        >
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-base font-extrabold text-[#0F172A]">Avisos</h2>
            <span className="text-[13px] font-semibold text-[#475569]">{unread ? `${unread} sin leer` : "Todo leído"}</span>
          </div>
          {data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#475569]">No hay avisos. Aquí aparecen las órdenes que se acercan a su plazo.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-[#F1F5F9] overflow-y-auto">
              {data.items.map((n) => {
                const c = LEVEL[n.threshold];
                return (
                  <li key={n.id}>
                    <a
                      href={n.href}
                      onClick={(e) => {
                        e.preventDefault();
                        openItem(n.id, n.href, n.read);
                      }}
                      className={`flex gap-3 px-4 py-3 hover:bg-[#F8FAFC] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-[#2563EB] ${n.read ? "" : "bg-[#F8FAFF]"}`}
                    >
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.dot }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>
                            {c.label}
                          </span>
                          {n.read ? null : <span className="text-[11px] font-bold text-[#1D4ED8]">Nuevo</span>}
                          <span className="ml-auto text-xs text-[#475569] tabular-nums">{formatShortDateTime(n.createdAt, now)}</span>
                        </span>
                        <span className={`mt-1 block text-sm leading-snug ${n.read ? "text-[#475569]" : "font-semibold text-[#0F172A]"}`}>{n.message}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[#E2E8F0] p-2">
            <button
              type="button"
              disabled={busy || unread === 0}
              onClick={() => void mark({ all: true })}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-[#1D4ED8] hover:bg-[#EFF6FF] disabled:cursor-not-allowed disabled:text-[#94A3B8] disabled:hover:bg-transparent"
            >
              <CheckCheck size={18} aria-hidden /> Marcar todos como leídos
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
