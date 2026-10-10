import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { Wrench } from "lucide-react";
import type { NotificationSummary } from "@/server/notifications";
import { HeaderNav, NewReportButton, type NavLink } from "./header-nav";
import { mobileFont } from "./mobile-font";
import { MobileBottomNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

// Se descarga al compilar y se sirve desde la propia app (la CSP solo permite fuentes de 'self').
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });

/**
 * Navegación de la app.
 * - Tablet y computador (≥ 768px): barra superior "clara flotante".
 * - Celular (< 768px): encabezado simple arriba y barra inferior flotante (MobileBottomNav).
 */
export function AppHeader({
  userName,
  links,
  home,
  newReportHref,
  notifications,
}: {
  userName: string;
  links: NavLink[];
  home: string;
  /** Solo el administrador crea reportes. */
  newReportHref?: string;
  /** Avisos de plazo del usuario (campanita). */
  notifications: NotificationSummary;
}) {
  return (
    <>
      <header
        className={`${dmSans.className} sticky top-3 z-20 mx-3 mt-3 hidden h-[72px] items-center gap-1.5 rounded-[18px] border border-[#E2E8F0] bg-white px-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:top-5 sm:mx-8 sm:mt-5 sm:gap-3 sm:px-4 md:flex`}
      >
        <Link href={home} className="hidden min-h-11 shrink-0 items-center gap-3 sm:flex" aria-label="Reportes de daños — inicio">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#2563EB] text-white shadow-[0_6px_14px_rgba(37,99,235,0.35)]">
            <Wrench size={20} strokeWidth={2} aria-hidden />
          </span>
          <span className="hidden whitespace-nowrap text-xl font-extrabold tracking-[-0.4px] text-[#0F172A] lg:inline">
            Reportes de daños
          </span>
        </Link>

        <HeaderNav links={links} />

        <div className="flex-1" />

        {newReportHref ? <NewReportButton href={newReportHref} /> : null}

        <NotificationBell initial={notifications} />

        <UserMenu userName={userName} />
      </header>

      {/* Celular: encabezado simple; el usuario y "Salir" están en la pestaña Cuenta. */}
      <div className={`${mobileFont.className} flex items-center justify-between gap-3 px-5 pt-[22px] pb-3.5 md:hidden`}>
        <Link href={home} className="flex min-h-11 min-w-0 items-center gap-3" aria-label="Reportes de daños — inicio">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white">
            <Wrench size={20} strokeWidth={2} aria-hidden />
          </span>
          <span className="truncate text-[17px] font-extrabold text-[#0F172A]">Reportes de daños</span>
        </Link>
        <NotificationBell initial={notifications} />
      </div>
      <MobileBottomNav links={links} newReportHref={newReportHref} userName={userName} />
    </>
  );
}
