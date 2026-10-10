import type { Metadata } from "next";
import { Flash } from "@/components/alert";
import { reportCode } from "@/domain/labels";
import { listForTechnician } from "@/server/reports";
import { requireRole } from "@/server/session";
import { TechnicianHomeView, type HomeTab } from "./home-view";

export const metadata: Metadata = { title: "Mis reportes" };

export default async function TechnicianHome({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; page?: string; tab?: string; r?: string }>;
}) {
  const user = await requireRole("TECNICO");
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(sp.page) || 1));
  const { mine, available, pageCount, availableTotal, doneToday } = await listForTechnician(user.id, page);
  const tab: HomeTab = sp.tab === "disponibles" ? "disponibles" : "a-mi-cargo";

  // Al enviar "Realizado" desde el detalle se vuelve aquí con ?msg=realizado&r=<código>.
  const code = Number(sp.r);
  const initialToast =
    sp.msg === "realizado" && Number.isInteger(code) && code > 0 ? `${reportCode(code)} realizado. Pasó a Mi historial.` : null;

  return (
    <TechnicianHomeView
      firstName={user.name.split(" ")[0] ?? user.name}
      mine={mine}
      available={available}
      availableTotal={availableTotal}
      doneToday={doneToday}
      page={page}
      pageCount={pageCount}
      initialTab={tab}
      initialToast={initialToast}
      flash={<Flash msg={sp.msg} />}
      now={Date.now()}
    />
  );
}
