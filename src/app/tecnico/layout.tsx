import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/server/session";

export default async function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("TECNICO");
  return (
    <>
      <AppHeader
        userName={user.name}
        home="/tecnico"
        links={[
          { href: "/tecnico", label: "Reportes", icon: "reports" },
          { href: "/tecnico/historial", label: "Mi historial", icon: "history" },
        ]}
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[calc(120px+env(safe-area-inset-bottom))] md:pb-5">{children}</main>
    </>
  );
}
