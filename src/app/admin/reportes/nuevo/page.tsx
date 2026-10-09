import type { Metadata } from "next";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";
import { createReportAction } from "../../actions";
import { ReportForm } from "../report-form";

export const metadata: Metadata = { title: "Nuevo reporte" };

export default async function NewReportPage() {
  await requireRole("ADMIN");
  const technicians = await listActiveTechniciansForSelect();
  return (
    <>
      <h1 className="text-2xl font-bold">Nuevo reporte</h1>
      <ReportForm
        action={createReportAction}
        technicians={technicians}
        submitLabel="Publicar reporte"
        cancelHref="/admin/reportes"
        initial={{
          street: "",
          neighborhood: "",
          referencePoint: "",
          category: "",
          description: "",
          priority: "",
          clientName: "",
          clientPhone: "",
          contractNumber: "",
          assignedToId: "",
        }}
      />
    </>
  );
}
