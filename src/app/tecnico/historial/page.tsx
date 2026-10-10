import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/badges";
import { Pagination } from "@/components/pagination";
import { TypeTag } from "@/components/type-tag";
import { AUDIT_ACTION_LABEL, reportCode } from "@/domain/labels";
import { formatDateTime } from "@/lib/dates";
import { technicianHistory } from "@/server/reports";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Mi historial" };

export default async function TechnicianHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireRole("TECNICO");
  const page = Math.max(1, Math.min(10_000, Number((await searchParams).page) || 1));
  const { items, total, pageCount } = await technicianHistory(user.id, page);

  return (
    <>
      <h1 className="text-2xl font-bold">Mi historial</h1>
      <p className="text-slate-600">{total} visita(s) registradas.</p>
      {items.length === 0 ? <p className="card text-slate-600">Aún no ha registrado visitas.</p> : null}
      <ul className="space-y-3">
        {items.map((e) =>
          e.report ? (
            <li key={e.id.toString()}>
              <Link href={`/tecnico/reportes/${e.report.id}`} className="card block hover:border-brand-600">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeTag type={e.report.type} />
                  <span className="font-semibold">{AUDIT_ACTION_LABEL[e.action]}</span>
                  <span className="ml-auto font-mono text-xs text-slate-500">{reportCode(e.report.code)}</span>
                </div>
                <p className="mt-1 font-bold">{e.report.street}</p>
                <p className="text-slate-700">
                  {e.report.neighborhood}, {e.report.city}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {formatDateTime(e.createdAt)} · Estado actual: <StatusBadge status={e.report.status} />
                </p>
              </Link>
            </li>
          ) : null,
        )}
      </ul>
      <Pagination page={page} pageCount={pageCount} basePath="/tecnico/historial" params={{}} />
    </>
  );
}
