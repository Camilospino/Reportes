"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, History, Key, LayoutDashboard, LogOut, Plus, Users } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { activeHref, initials, type NavLink } from "./header-nav";
import { mobileFont } from "./mobile-font";

const ICONS = { dashboard: LayoutDashboard, reports: FileText, users: Users, history: History } as const;

type Slot = { kind: "link"; link: NavLink } | { kind: "new"; href: string } | { kind: "account" };

/**
 * Barra inferior flotante para celular (< 768px): pestañas del rol, botón central "Nuevo reporte"
 * (solo si el rol puede crear) y "Cuenta", que abre un panel con "Mi contraseña" y "Salir".
 */
export function MobileBottomNav({
  links,
  newReportHref,
  userName,
}: {
  links: NavLink[];
  newReportHref?: string;
  userName: string;
}) {
  const pathname = usePathname();
  const active = activeHref(pathname, links);
  const [sheetOpen, setSheetOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);

  // Orden: pestañas del rol con el botón central en medio, y "Cuenta" al final.
  const slots: Slot[] = [...links.map((link) => ({ kind: "link" as const, link })), { kind: "account" }];
  if (newReportHref) slots.splice(Math.floor(slots.length / 2), 0, { kind: "new", href: newReportHref });
  const activeIndex = slots.findIndex((s) => s.kind === "link" && s.link.href === active);
  const count = slots.length;

  // Al navegar, el panel se cierra.
  useEffect(() => setSheetOpen(false), [pathname]);

  function closeSheet() {
    setSheetOpen(false);
    accountButton.current?.focus();
  }

  return (
    <>
      <nav
        aria-label="Principal"
        className={`${mobileFont.className} fixed right-4 bottom-[calc(18px+env(safe-area-inset-bottom))] left-4 z-40 h-[72px] rounded-[26px] bg-[#0F172A] shadow-[0_18px_40px_rgba(15,23,42,.35)] md:hidden`}
      >
        <div className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {activeIndex >= 0 ? (
            <span
              aria-hidden
              className="absolute top-2 h-14 w-[62px] rounded-[18px] bg-[#FDE047] transition-[left] duration-500 ease-[cubic-bezier(.4,1.6,.5,1)] motion-reduce:transition-none"
              // Centro de la columna activa menos la mitad de la burbuja.
              style={{ left: `calc(${((activeIndex + 0.5) * 100) / count}% - 31px)` }}
            />
          ) : null}

          {slots.map((slot) => {
            if (slot.kind === "new") {
              return (
                <div key="new" className="relative flex justify-center">
                  <Link
                    href={slot.href}
                    aria-label="Nuevo reporte"
                    className="absolute -top-[22px] flex size-[62px] items-center justify-center rounded-full border-[5px] border-[#F1F5F9] bg-[#FDE047] text-[#0F172A] shadow-[0_10px_24px_rgba(250,204,21,.5)] transition-transform active:scale-90 motion-reduce:transition-none"
                  >
                    <Plus size={26} strokeWidth={2.5} aria-hidden />
                  </Link>
                </div>
              );
            }
            if (slot.kind === "account") {
              return (
                <button
                  key="account"
                  ref={accountButton}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={sheetOpen}
                  onClick={() => setSheetOpen(true)}
                  className="relative flex min-h-11 flex-col items-center justify-center gap-1 text-[#94A3B8]"
                >
                  <span className="flex size-[26px] items-center justify-center rounded-full bg-[#F97316] text-[11px] font-extrabold text-white">
                    {initials(userName)}
                  </span>
                  <span className="text-[11px] font-bold">Cuenta</span>
                </button>
              );
            }
            const Icon = ICONS[slot.link.icon];
            const isActive = slot.link.href === active;
            return (
              <Link
                key={slot.link.href}
                href={slot.link.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-1 transition-colors motion-reduce:transition-none ${
                  isActive ? "text-[#0F172A]" : "text-[#94A3B8]"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                  className={`transition-transform duration-[350ms] ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none ${
                    isActive ? "-translate-y-0.5 scale-110" : ""
                  }`}
                />
                <span className="max-w-full truncate px-0.5 text-[11px] font-bold">{slot.link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {sheetOpen ? <AccountSheet userName={userName} onClose={closeSheet} /> : null}
    </>
  );
}

/** Panel inferior de Cuenta: role="dialog", se cierra con el fondo, con Escape o al navegar. */
function AccountSheet({ userName, onClose }: { userName: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const action = "flex h-[54px] w-full items-center gap-3 rounded-[14px] px-4 text-base font-bold";

  return (
    <div className={`${mobileFont.className} fixed inset-0 z-50 md:hidden`}>
      <div className="absolute inset-0 bg-[rgba(15,23,42,.45)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Cuenta"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex animate-[sheet-up_.35s_cubic-bezier(.3,1.2,.5,1)] flex-col gap-3 rounded-t-[28px] bg-white px-5 pt-3 pb-[calc(30px+env(safe-area-inset-bottom))] outline-none motion-reduce:animate-none"
      >
        <span className="mx-auto mb-2 h-[5px] w-11 rounded-full bg-[#CBD5E1]" aria-hidden />
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#F97316] text-base font-extrabold text-white">
            {initials(userName)}
          </span>
          <span className="truncate text-lg font-bold text-[#0F172A]">{userName}</span>
        </div>
        <Link href="/cambiar-clave" onClick={onClose} className={`${action} bg-[#F1F5F9] text-[#0F172A]`}>
          <Key size={20} strokeWidth={2} aria-hidden />
          Mi contraseña
        </Link>
        <form action={logoutAction}>
          <button type="submit" className={`${action} bg-[#FEF2F2] text-[#B91C1C]`}>
            <LogOut size={20} strokeWidth={2} aria-hidden />
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}
