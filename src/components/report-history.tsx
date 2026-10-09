import { ATTACHMENT_KIND_LABEL, AUDIT_ACTION_LABEL, REPORT_FIELD_LABEL, STATUS_LABEL } from "@/domain/labels";
import { formatDateOnly, formatDateTime, parseBogotaDateTimeLocal } from "@/lib/dates";
import type { ReportDetail } from "@/server/reports";

type Entry = ReportDetail["auditLog"][number];

/** Historial del reporte (bitácora): quién hizo qué y cuándo, con las fotos de cada evento. */
export function ReportHistory({ entries, showIp = false }: { entries: Entry[]; showIp?: boolean }) {
  return (
    <section className="card">
      <h2 className="mb-4 text-lg font-bold">Historial</h2>
      <ol className="relative space-y-5 border-l-2 border-slate-200 pl-5">
        {[...entries].reverse().map((e) => (
          <li key={e.id.toString()} className="relative">
            <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-brand-600 ring-4 ring-white" />
            <p className="font-semibold">
              {AUDIT_ACTION_LABEL[e.action] ?? e.action}
              {e.fromStatus && e.toStatus ? (
                <span className="font-normal text-slate-500">
                  {" "}
                  · {STATUS_LABEL[e.fromStatus]} → {STATUS_LABEL[e.toStatus]}
                </span>
              ) : null}
            </p>
            <p className="text-sm text-slate-500">
              {e.actor?.name ?? "Sistema"} · {formatDateTime(e.createdAt)}
              {showIp && e.ip ? ` · IP ${e.ip}` : ""}
            </p>
            <EntryData data={e.data} />
            {e.comment ? (
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">Comentario:</span> {e.comment}
              </p>
            ) : null}
            {e.attachments.length > 0 ? (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {e.attachments.map((a) => (
                  <a key={a.id} href={`/api/fotos/${a.id}`} target="_blank" rel="noopener" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fotos privadas servidas por la API */}
                    <img
                      src={`/api/fotos/${a.id}`}
                      alt={ATTACHMENT_KIND_LABEL[a.kind]}
                      loading="lazy"
                      width={a.width}
                      height={a.height}
                      className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                    />
                    <span className="text-xs text-slate-500">{ATTACHMENT_KIND_LABEL[a.kind]}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EntryData({ data }: { data: Entry["data"] }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const rows: [string, string][] = [];
  if (typeof d.nota === "string") rows.push(["Nota", d.nota]);
  if (typeof d.motivo === "string" && !("username" in d)) rows.push(["Motivo", d.motivo]);
  if (typeof d.nuevaFecha === "string") rows.push(["Nueva fecha estimada", formatDateOnly(`${d.nuevaFecha}T00:00:00Z`)]);
  if (typeof d.fechaIntento === "string") rows.push(["Fecha y hora del intento", formatDateTime(parseBogotaDateTimeLocal(d.fechaIntento))]);
  const changes = d.changes as Record<string, { from: string | null; to: string | null }> | undefined;

  return (
    <>
      {rows.map(([k, v]) => (
        <p key={k} className="mt-1 text-sm">
          <span className="font-semibold">{k}:</span> <span className="whitespace-pre-wrap">{v}</span>
        </p>
      ))}
      {changes ? (
        <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
          {Object.entries(changes).map(([field, c]) => (
            <li key={field}>
              <span className="font-semibold">{REPORT_FIELD_LABEL[field] ?? field}:</span>{" "}
              <span className="line-through decoration-slate-400">{c.from || "—"}</span> → {c.to || "—"}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
