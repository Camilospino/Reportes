"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, History, LayoutDashboard, Plus, Users } from "lucide-react";

const ICONS = { dashboard: LayoutDashboard, reports: FileText, users: Users, history: History } as const;

/** Los íconos van por nombre: un Server Component no puede pasar componentes a uno de cliente. */
export type NavLink = { href: string; label: string; icon: keyof typeof ICONS };

/** Pestaña activa: la de ruta más larga que coincide (así /admin/reportes/123 marca "Reportes", no "Panel"). */
function activeHref(pathname: string, links: NavLink[]): string | undefined {
  return links
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function HeaderNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, links);
  return (
    <nav aria-label="Principal" className="flex shrink-0 gap-1 rounded-full bg-[#F1F5F9] p-1">
      {links.map((l) => {
        const Icon = ICONS[l.icon];
        const isActive = l.href === active;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive ? "page" : undefined}
            // En pantallas angostas solo se ve el ícono: aria-label conserva el nombre.
            aria-label={l.label}
            className={`flex h-11 min-w-11 items-center justify-center gap-2 rounded-full text-[15px] font-semibold whitespace-nowrap transition-colors min-[900px]:px-4 ${
              isActive
                ? "bg-white text-[#1D4ED8] shadow-[0_2px_8px_rgba(15,23,42,0.10)]"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <Icon size={18} strokeWidth={2} aria-hidden />
            <span className="hidden min-[900px]:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Acción principal. No lleva aria-current: en /admin/reportes/nuevo ya lo marca la pestaña "Reportes". */
export function NewReportButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Nuevo reporte"
      className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#2563EB] text-[15px] font-bold whitespace-nowrap text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-[#1D4ED8] min-[900px]:px-5"
    >
      <Plus size={20} strokeWidth={2} aria-hidden />
      <span className="hidden min-[900px]:inline">Nuevo reporte</span>
    </Link>
  );
}
