import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/alert";
import { ReportCard } from "@/components/report-card";
import { STATUS_LABEL } from "@/domain/labels";
import { REPORT_STATUSES } from "@/domain/types";
import { countByStatus, listAwaitingReview } from "@/server/reports";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Panel" };

const CARD_STYLE: Record<string, string> = {
  PENDIENTE: "border-sky-300",
  EN_PROCESO: "border-indigo-300",
  REALIZADO: "border-green-400",
  APLAZADO: "border-amber-400",
  CLIENTE_AUSENTE: "border-orange-400",
  VERIFICADO: "border-emerald-600",
  CANCELADO: "border-slate-300",
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireRole("ADMIN");
  const [counts, awaiting, { msg }] = await Promise.all([countByStatus(), listAwaitingReview(), searchParams]);
  const toReview = counts.REALIZADO + counts.APLAZADO + counts.CLIENTE_AUSENTE;

  return (
    <>
      <Flash msg={msg} />
      <h1 className="text-2xl font-bold">Panel</h1>

      <section aria-label="Reportes por estado" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {REPORT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/reportes?estado=${s}`}
            className={`card border-l-8 ${CARD_STYLE[s]} hover:bg-slate-50`}
          >
            <p className="text-3xl font-bold tabular-nums">{counts[s]}</p>
            <p className="text-sm font-semibold text-slate-600">{STATUS_LABEL[s]}</p>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Por revisar <span className="font-normal text-slate-500">({toReview})</span>
        </h2>
        {awaiting.length === 0 ? (
          <p className="card text-slate-600">No hay reportes esperando revisión. ✅</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {awaiting.map((r) => (
              <ReportCard key={r.id} report={r} href={`/admin/reportes/${r.id}`} showTechnician />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
