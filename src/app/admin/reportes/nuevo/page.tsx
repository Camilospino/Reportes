import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";
import { createReportAction } from "../../actions";
import { NewReportForm } from "./new-report-form";

export const metadata: Metadata = { title: "Nuevo reporte" };

// Solo para esta página. Se descarga al compilar y se sirve desde la app (CSP: font-src 'self').
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export default async function NewReportPage() {
  await requireRole("ADMIN");
  const technicians = await listActiveTechniciansForSelect();
  return (
    <div className={`${jakarta.className} mx-auto max-w-[1040px] space-y-6`}>
      <header>
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.8px] text-[#0F172A]">Nuevo reporte</h1>
        <p className="mt-1 text-base text-[#475569]">
          Elija el tipo de orden. En daños, una plantilla le llena lo principal. Todo se puede cambiar después.
        </p>
      </header>
      <NewReportForm action={createReportAction} technicians={technicians} />
    </div>
  );
}
