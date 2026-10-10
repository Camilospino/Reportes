"use client";

import { usePathname } from "next/navigation";

/**
 * Contenedor principal del administrador. El Panel de prioridades usa todo el ancho (su cabecera
 * oscura va de borde a borde) sobre fondo #EEF1F5; las demás páginas siguen centradas a max-w-5xl.
 */
export function AdminMain({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/admin";
  return (
    <main
      className={`space-y-4 py-5 pb-[calc(110px+env(safe-area-inset-bottom))] md:pb-5 ${
        wide ? "min-h-dvh bg-[#EEF1F5] px-4 lg:px-7" : "mx-auto max-w-5xl px-4"
      }`}
    >
      {children}
    </main>
  );
}
