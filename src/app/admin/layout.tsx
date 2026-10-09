import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/server/session";
import { AdminMain } from "./admin-main";

/**
 * Layout del administrador. requireRole también se llama en CADA página y acción:
 * en Next.js los layouts no se re-ejecutan en todas las navegaciones, así que no bastan solos.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  return (
    <>
      <AppHeader
        userName={user.name}
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
