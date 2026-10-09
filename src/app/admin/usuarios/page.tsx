import type { Metadata } from "next";
import { formatDate } from "@/lib/dates";
import { requireRole } from "@/server/session";
import { listTechnicians } from "@/server/users";
import { CreateTechnicianForm, TechnicianRowActions } from "./technician-forms";

export const metadata: Metadata = { title: "Técnicos" };

export default async function UsersPage() {
  await requireRole("ADMIN");
  const technicians = await listTechnicians();
  return (
    <>
      <h1 className="text-2xl font-bold">Técnicos</h1>
      <CreateTechnicianForm />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Listado ({technicians.length})</h2>
        {technicians.length === 0 ? <p className="card text-slate-600">Aún no hay técnicos.</p> : null}
        {technicians.map((t) => (
          <article key={t.id} className={`card flex flex-col gap-3 sm:flex-row sm:items-center ${t.active ? "" : "opacity-70"}`}>
            <div className="flex-1">
              <p className="text-lg font-bold">
                {t.name}{" "}
                {!t.active ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Inactivo</span>
                ) : null}
              </p>
              <p className="text-sm text-slate-600">
                Usuario: <span className="font-mono">{t.username}</span>
                {t.phone ? ` · ${t.phone}` : ""} · desde {formatDate(t.createdAt)}
              </p>
              <p className="text-sm text-slate-600">
                {t._count.assignedReports} reporte(s) en proceso
                {t.mustChangePassword ? " · debe cambiar su contraseña al entrar" : ""}
              </p>
            </div>
            <TechnicianRowActions userId={t.id} name={t.name} active={t.active} inProgress={t._count.assignedReports} />
          </article>
        ))}
      </section>
    </>
  );
}
