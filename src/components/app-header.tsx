import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { Bell, Wrench } from "lucide-react";
import { HeaderNav, NewReportButton, type NavLink } from "./header-nav";
import { UserMenu } from "./user-menu";

// Se descarga al compilar y se sirve desde la propia app (la CSP solo permite fuentes de 'self').
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });

/** Barra superior "clara flotante": logo, pestañas, acción principal, notificaciones y menú de usuario. */
export function AppHeader({
  userName,
  links,
  home,
  newReportHref,
}: {
  userName: string;
  links: NavLink[];
  home: string;
  /** Solo el administrador crea reportes. */
  newReportHref?: string;
}) {
  return (
    <header
      className={`${dmSans.className} sticky top-3 z-20 mx-3 mt-3 flex h-[72px] items-center gap-1.5 rounded-[18px] border border-[#E2E8F0] bg-white px-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:top-5 sm:mx-8 sm:mt-5 sm:gap-3 sm:px-4`}
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

      {/* TODO: la app aún no tiene notificaciones. Cuando existan, abrir aquí la lista y mostrar el
          punto rojo (pasar `unread`) solo si hay pendientes. */}
      <button
        type="button"
        aria-label="Notificaciones"
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]"
      >
        <Bell size={20} strokeWidth={2} aria-hidden />
        <UnreadDot unread={false} />
      </button>

      <UserMenu userName={userName} />
    </header>
  );
}

function UnreadDot({ unread }: { unread: boolean }) {
  if (!unread) return null;
  return <span className="absolute top-2 right-2 size-[9px] rounded-full bg-[#EF4444] ring-2 ring-white" aria-hidden />;
}
