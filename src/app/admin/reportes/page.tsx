import type { Metadata } from "next";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Pagination } from "@/components/pagination";
import { ReportCard } from "@/components/report-card";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, reportCode } from "@/domain/labels";
import { reportFiltersSchema } from "@/domain/schemas";
import { PRIORITIES, REPORT_STATUSES } from "@/domain/types";
import { formatDateTime } from "@/lib/dates";
import { listReportsForAdmin } from "@/server/reports";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";

export const metadata: Metadata = { title: "Reportes" };

type SP = Record<string, string | string[] | undefined>;

export default async function ReportsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  const raw = await searchParams;
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const filters = reportFiltersSchema.parse({
    estado: one("estado"),
    prioridad: one("prioridad"),
    tecnico: one("tecnico"),
    desde: one("desde") || undefined,
    hasta: one("hasta") || undefined,
    q: one("q"),
    page: one("page"),
  });
  const [result, technicians] = await Promise.all([listReportsForAdmin(filters), listActiveTechniciansForSelect()]);
  const { page: _page, ...params } = filters;
  const hasFilters = Object.values(params).some(Boolean);

  return (
    <>
      <h1 className="text-2xl font-bold">Reportes</h1>

      {/* Formulario GET: los filtros quedan en la URL (se pueden compartir y funcionan sin JS). */}
      <form method="get" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="search">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="q" className="label">
            Buscar por dirección
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Contrato, calle, barrio…" className="input" />
        </div>
        <Select name="estado" label="Estado" value={filters.estado} options={REPORT_STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
        <Select name="prioridad" label="Prioridad" value={filters.prioridad} options={PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])} />
        <Select
          name="tecnico"
          label="Técnico"
          value={filters.tecnico}
          options={[["sin", "Sin asignar"], ...technicians.map((t) => [t.id, t.name] as [string, string])]}
        />
        <div>
          <label htmlFor="desde" className="label">
            Creado desde
          </label>
          <input id="desde" name="desde" type="date" defaultValue={filters.desde} className="input" />
        </div>
        <div>
          <label htmlFor="hasta" className="label">
            Creado hasta
          </label>
          <input id="hasta" name="hasta" type="date" defaultValue={filters.hasta} className="input" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            Filtrar
          </button>
          {hasFilters ? (
            <Link href="/admin/reportes" className="btn btn-secondary">
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-slate-600">
        {result.total} reporte{result.total === 1 ? "" : "s"}
      </p>

      {result.items.length === 0 ? (
        <p className="card text-slate-600">No se encontraron reportes con esos filtros.</p>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <div className="grid gap-3 md:hidden">
            {result.items.map((r) => (
              <ReportCard key={r.id} report={r} href={`/admin/reportes/${r.id}`} showTechnician />
            ))}
          </div>
          {/* Escritorio: tabla */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Dirección</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Prioridad</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono">
                      <Link href={`/admin/reportes/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                        {reportCode(r.code)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/reportes/${r.id}`} className="hover:underline">
                        <span className="font-medium">{r.street}</span>
                        <span className="block text-slate-500">
                          {r.neighborhood}, {r.city}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABEL[r.category]}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{r.assignedTo?.name ?? <span className="text-slate-400">Sin asignar</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination page={result.page} pageCount={result.pageCount} basePath="/admin/reportes" params={params} />
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <select id={name} name={name} defaultValue={value ?? ""} className="input">
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
