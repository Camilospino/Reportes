import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Flash } from "@/components/alert";
import { ReportHistory } from "@/components/report-history";
import { ReportInfo } from "@/components/report-info";
import { reportCode } from "@/domain/labels";
import { EDITABLE_STATUSES, availableTransitions } from "@/domain/report-state";
import { getReportDetail } from "@/server/reports";
import { requireRole } from "@/server/session";
import { AdminDecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Detalle del reporte" };

export default async function AdminReportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const report = await getReportDetail(id);
  if (!report) notFound();
  const { msg } = await searchParams;

  const transitions = availableTransitions(report, { id: admin.id, role: "ADMIN" });

  return (
    <>
      <Flash msg={msg} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/reportes" className="text-sm font-semibold text-brand-700 hover:underline">
            ← Reportes
          </Link>
          <h1 className="text-2xl font-bold">Reporte {reportCode(report.code)}</h1>
        </div>
        {EDITABLE_STATUSES.includes(report.status) ? (
          <Link href={`/admin/reportes/${report.id}/editar`} className="btn btn-secondary">
            Editar
          </Link>
        ) : null}
      </div>

      {transitions.length > 0 ? (
        <AdminDecisionPanel reportId={report.id} status={report.status} transitions={transitions} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ReportInfo report={report} />
        </div>
        <div className="lg:col-span-2">
          <ReportHistory entries={report.auditLog} showIp />
        </div>
      </div>
    </>
  );
}
