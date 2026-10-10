import { AppHeader } from "@/components/app-header";
import { maybeRunDeadlineCheck } from "@/server/deadlines";
import { getNotificationSummary } from "@/server/notifications";
import { requireRole } from "@/server/session";
import { AdminMain } from "./admin-main";

/**
 * Layout del administrador. requireRole también se llama en CADA página y acción:
 * en Next.js los layouts no se re-ejecutan en todas las navegaciones, así que no bastan solos.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  // Revisión "perezosa" de plazos (máx. cada 10 min) antes de contar los avisos de la campanita.
  await maybeRunDeadlineCheck();
  const notifications = await getNotificationSummary(user);
  return (
    <>
      <AppHeader
        userName={user.name}
        notifications={notifications}
        home="/admin"
        newReportHref="/admin/reportes/nuevo"
        links={[
          { href: "/admin", label: "Panel", icon: "dashboard" },
          { href: "/admin/reportes", label: "Reportes", icon: "reports" },
          { href: "/admin/usuarios", label: "Técnicos", icon: "users" },
        ]}
      />
      <AdminMain>{children}</AdminMain>
    </>
  );
}
