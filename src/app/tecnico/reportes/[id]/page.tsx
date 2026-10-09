import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Alert } from "@/components/alert";
import { ReportHistory } from "@/components/report-history";
import { ReportInfo } from "@/components/report-info";
import { checkTransition } from "@/domain/report-state";
import { getReportDetail, technicianCanAccessReport } from "@/server/reports";
import { requireRole } from "@/server/session";
import { TechActions } from "./tech-actions";

export const metadata: Metadata = { title: "Reporte" };

export default async function TechnicianReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("TECNICO");
  const { id } = await params;
  // Sin acceso => 404 (no se revela si el reporte existe).
  if (!z.string().uuid().safeParse(id).success || !(await technicianCanAccessReport(id, user.id))) notFound();
  const report = await getReportDetail(id);
  if (!report) notFound();

  const actor = { id: user.id, role: "TECNICO" as const };
  const canTake = checkTransition("TOMAR", report, actor).ok;
  const isWorking = checkTransition("REALIZADO", report, actor).ok;

  // Si el admin devolvió el reporte, mostrar su observación al técnico.
  const last = report.auditLog.at(-1);
  const adminNote =
    report.status === "PENDIENTE" && last && (last.action === "RECHAZAR" || last.action === "REPROGRAMAR") ? last.comment : null;

  return (
    <>
      <Link href="/tecnico" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Volver a reportes
      </Link>
      {adminNote ? (
        <Alert kind="warning">
          <strong>Observación del administrador:</strong> {adminNote}
        </Alert>
      ) : null}
      <ReportInfo report={report} />
      <TechActions reportId={report.id} canTake={canTake} isWorking={isWorking} />
      <ReportHistory entries={report.auditLog} />
    </>
  );
}
