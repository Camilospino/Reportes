import { CATEGORY_LABEL, reportCode } from "@/domain/labels";
import { googleMapsUrl } from "@/domain/text";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import type { ReportDetail } from "@/server/reports";
import { PriorityBadge, StatusBadge } from "./badges";

/** Datos del reporte (dirección, cliente, daño) con acceso directo a Maps y a llamar. */
export function ReportInfo({ report }: { report: ReportDetail }) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-slate-500">{reportCode(report.code)}</span>
        <StatusBadge status={report.status} />
        <PriorityBadge priority={report.priority} />
        <span className="text-sm text-slate-600">{CATEGORY_LABEL[report.category]}</span>
      </div>

      <div>
        <h2 className="text-xl font-bold leading-tight">{report.street}</h2>
        <p className="text-slate-700">
          {report.neighborhood}, {report.city}
        </p>
        {report.referencePoint ? <p className="mt-1 text-slate-600">Referencia: {report.referencePoint}</p> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <a href={googleMapsUrl(report)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          📍 Abrir en Google Maps
        </a>
        <a href={`tel:${report.clientPhone}`} className="btn btn-secondary">
          📞 Llamar a {report.clientName.split(" ")[0]}
        </a>
      </div>

      <div>
        <h3 className="label">Descripción del posible daño</h3>
        <p className="whitespace-pre-wrap text-slate-800">{report.description}</p>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Item label="Cliente" value={`${report.clientName} · ${report.clientPhone}`} />
        <Item label="Número de contrato" value={report.contractNumber ?? "Sin registrar"} />
        <Item label="Técnico" value={report.assignedTo?.name ?? "Sin asignar"} />
        <Item label="Creado" value={`${formatDateTime(report.createdAt)} por ${report.createdBy.name}`} />
        {report.status === "APLAZADO" && report.rescheduledFor ? (
          <Item label="Nueva fecha estimada" value={formatDateOnly(report.rescheduledFor)} />
        ) : null}
      </dl>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
