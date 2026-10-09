import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { appEnvironment } from "@/lib/environment";
import "./globals.css";

const titlePrefix = appEnvironment ? `[${appEnvironment.label}] ` : "";

export const metadata: Metadata = {
  // En desarrollo y QA el título de la pestaña empieza con el entorno, ej.: "[QA] Reportes de daños".
  title: {
    default: `${titlePrefix}Reportes de daños`,
    template: `${titlePrefix}%s · Reportes de daños`,
  },
  description: "Gestión de daños del servicio de internet en campo",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: appEnvironment?.themeColor ?? "#1e40af",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Fuerza renderizado dinámico en TODAS las páginas (incluida la 404): la CSP usa un nonce
  // distinto por petición y una página estática tendría sus scripts bloqueados.
  await connection();
  return (
    <html lang="es-CO">
      <body className="min-h-dvh">
        {appEnvironment ? (
          <div className={`px-4 py-1 text-center text-xs font-bold tracking-wide ${appEnvironment.className}`}>
            Entorno de {appEnvironment.label} · no es producción
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
