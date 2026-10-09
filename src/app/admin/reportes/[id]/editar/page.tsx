import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { reportCode } from "@/domain/labels";
import { EDITABLE_STATUSES } from "@/domain/report-state";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";
import { updateReportAction } from "../../../actions";
import { ReportForm } from "../../report-form";

export const metadata: Metadata = { title: "Editar reporte" };

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [report, technicians] = await Promise.all([
    prisma.report.findUnique({ where: { id }, include: { assignedTo: { select: { id: true, name: true } } } }),
    listActiveTechniciansForSelect(),
  ]);
  if (!report) notFound();
  if (!EDITABLE_STATUSES.includes(report.status)) redirect(`/admin/reportes/${id}`);

  // Si el técnico asignado fue desactivado, se incluye igual para que el formulario lo muestre.
  if (report.assignedTo && !technicians.some((t) => t.id === report.assignedTo!.id)) {
    technicians.push({ ...report.assignedTo, name: `${report.assignedTo.name} (inactivo)` });
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Editar {reportCode(report.code)}</h1>
      <ReportForm
        action={updateReportAction.bind(null, report.id)}
        technicians={technicians}
        lockTechnician={report.status === "EN_PROCESO"}
        submitLabel="Guardar cambios"
        cancelHref={`/admin/reportes/${report.id}`}
        initial={{
          street: report.street,
          neighborhood: report.neighborhood,
          referencePoint: report.referencePoint ?? "",
          category: report.category,
          description: report.description,
          priority: report.priority,
          clientName: report.clientName,
          clientPhone: report.clientPhone,
          contractNumber: report.contractNumber ?? "",
          assignedToId: report.assignedToId ?? "",
          version: report.version,
        }}
      />
    </>
  );
}
