"use client";

import { usePathname } from "next/navigation";

/**
 * Contenedor principal del administrador. El Panel (bandeja de dos columnas) usa todo el ancho
 * con márgenes de 28 px; las demás páginas siguen centradas a max-w-5xl.
 */
export function AdminMain({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/admin";
  return (
    <main
      className={`space-y-4 py-5 pb-[calc(110px+env(safe-area-inset-bottom))] md:pb-5 ${
        wide ? "px-4 lg:px-7" : "mx-auto max-w-5xl px-4"
      }`}
    >
      {children}
    </main>
  );
}
