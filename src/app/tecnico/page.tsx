import type { Metadata } from "next";
import { Flash } from "@/components/alert";
import { Pagination } from "@/components/pagination";
import { ReportCard } from "@/components/report-card";
import { listForTechnician } from "@/server/reports";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Mis reportes" };

export default async function TechnicianHome({ searchParams }: { searchParams: Promise<{ msg?: string; page?: string }> }) {
  const user = await requireRole("TECNICO");
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(sp.page) || 1));
  const { mine, available, pageCount, availableTotal } = await listForTechnician(user.id, page);

  return (
    <>
      <Flash msg={sp.msg} />
      <h1 className="text-2xl font-bold">Hola, {user.name.split(" ")[0]}</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          A mi cargo <span className="font-normal text-slate-500">({mine.length})</span>
        </h2>
        {mine.length === 0 ? (
          <p className="card text-slate-600">No tiene reportes en curso. Tome uno de los disponibles.</p>
        ) : (
          mine.map((r) => <ReportCard key={r.id} report={r} href={`/tecnico/reportes/${r.id}`} />)
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Disponibles <span className="font-normal text-slate-500">({availableTotal})</span>
        </h2>
        {available.length === 0 ? (
          <p className="card text-slate-600">No hay reportes pendientes por ahora.</p>
        ) : (
          available.map((r) => <ReportCard key={r.id} report={r} href={`/tecnico/reportes/${r.id}`} />)
        )}
        <Pagination page={page} pageCount={pageCount} basePath="/tecnico" params={{}} />
      </section>
    </>
  );
}
