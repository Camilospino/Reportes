import type { Metadata } from "next";
import Link from "next/link";
import { listDeadlineConfig } from "@/server/deadline-config";
import { requireRole } from "@/server/session";
import { DeadlineSettingsForm } from "./deadline-settings-form";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireRole("ADMIN");
  const rows = await listDeadlineConfig();
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Panel
        </Link>
        <h1 className="text-2xl font-bold">Ajustes</h1>
      </div>
      <section aria-labelledby="plazos-title" className="card space-y-4">
        <div>
          <h2 id="plazos-title" className="text-lg font-bold">
            Plazos
          </h2>
          <p className="text-sm text-slate-600">
            Horas corridas que tiene cada tipo de orden desde que se crea, y desde cuántas horas empieza a avisar. &quot;Por vencer&quot; empieza a
            los 2/3 del plazo. Los cambios solo aplican a las órdenes nuevas.
          </p>
        </div>
        <DeadlineSettingsForm initial={rows} />
      </section>
    </div>
  );
}
