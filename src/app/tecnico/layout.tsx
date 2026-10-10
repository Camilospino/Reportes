import { AppHeader } from "@/components/app-header";
import { maybeRunDeadlineCheck } from "@/server/deadlines";
import { getNotificationSummary } from "@/server/notifications";
import { requireRole } from "@/server/session";

export default async function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("TECNICO");
  // Revisión "perezosa" de plazos (máx. cada 10 min) antes de contar los avisos de la campanita.
  await maybeRunDeadlineCheck();
  const notifications = await getNotificationSummary(user);
  return (
    <>
      <AppHeader
        userName={user.name}
        notifications={notifications}
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
