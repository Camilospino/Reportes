import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { orderSummary } from "@/domain/labels";
import { reportFiltersSchema } from "@/domain/schemas";
import { TIME_ZONE } from "@/lib/dates";
import { listReportsForAdmin } from "@/server/reports";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";
import { ReportsBrowser, type ReportRow } from "./reports-browser";

export const metadata: Metadata = { title: "Reportes" };

// Solo para esta página. Se descargan al compilar y se sirven desde la app (CSP: font-src 'self').
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["700"], variable: "--font-code" });

// Fechas formateadas en el servidor, en hora de Colombia: "8 oct 2026" y "10:37 p. m.".
const dayFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });

/** "8 oct 2026": es-CO escribe "8 de oct. de 2026", así que se arma por partes. */
function shortDay(d: Date): string {
  const part = (t: string) => dayFmt.formatToParts(d).find((p) => p.type === t)?.value ?? "";
  return `${part("day")} ${part("month").replace(".", "")} ${part("year")}`;
}

type SP = Record<string, string | string[] | undefined>;

export default async function ReportsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  const raw = await searchParams;
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  // Los filtros viven en la URL: sobreviven al recargar y se pueden compartir.
  const filters = reportFiltersSchema.parse({
    estado: one("estado") || undefined,
    prioridad: one("prioridad") || undefined,
    tecnico: one("tecnico") || undefined,
    desde: one("desde") || undefined,
    hasta: one("hasta") || undefined,
    q: one("q") || undefined,
    tipo: one("tipo") || undefined,
    plazo: one("plazo") || undefined,
    orden: one("orden"),
    page: one("page"),
  });
  const [result, technicians] = await Promise.all([listReportsForAdmin(filters), listActiveTechniciansForSelect()]);

  const rows: ReportRow[] = result.items.map((r) => ({
    id: r.id,
    code: r.code,
    street: r.street,
    neighborhood: r.neighborhood,
    city: r.city,
    type: r.type,
    summary: orderSummary(r),
    priority: r.priority,
    status: r.status,
    assignedToId: r.assignedToId,
    assignedName: r.assignedTo?.name ?? null,
    version: r.version,
    createdDay: shortDay(r.createdAt),
    createdTime: timeFmt.format(r.createdAt),
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    warnFromHours: r.warnFromHours,
    completedAt: r.completedAt,
  }));

  return (
    // Más ancho que el resto del admin (1280px), centrado respecto a la ventana sin desbordarla.
    // Con márgenes y no con transform: un transform haría que el panel lateral y el aviso (position:
    // fixed) se ubiquen respecto a este bloque en vez de la pantalla.
    <div
      className={`${interTight.className} ${mono.variable} ml-[calc(50%-min(640px,50vw-1rem))] w-[min(1280px,calc(100vw-2rem))] md:ml-[calc(50%-min(640px,50vw-1.75rem))] md:w-[min(1280px,calc(100vw-3.5rem))]`}
    >
      <ReportsBrowser
        rows={rows}
        counts={result.statusCounts}
        typeCounts={result.typeCounts}
        levelCounts={result.levelCounts}
        now={Date.now()}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          estado: filters.estado,
          prioridad: filters.prioridad,
          tecnico: filters.tecnico,
          desde: filters.desde,
          hasta: filters.hasta,
          q: filters.q,
          tipo: filters.tipo,
          plazo: filters.plazo,
          orden: filters.orden,
        }}
        technicians={technicians}
      />
    </div>
  );
}
