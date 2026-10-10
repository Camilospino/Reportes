import { CATEGORY_LABEL, WITHDRAWAL_REASON_LABEL, reportCode } from "@/domain/labels";
import { googleMapsUrl } from "@/domain/text";
import { formatDateOnly, formatDateTime, formatDueDate } from "@/lib/dates";
import type { ReportDetail } from "@/server/reports";
import { PriorityBadge, StatusBadge } from "./badges";
import { EquipmentTable } from "./equipment-table";
import { PlazoTag } from "./plazo-tag";
import { TypeTag } from "./type-tag";

const DESCRIPTION_LABEL = {
  DANO: "Descripción del posible daño",
  INSTALACION: "Observaciones",
  RETIRO: "Observaciones",
} as const;

/** Datos de la orden (dirección, cliente, tipo, plazo y equipos) con acceso directo a Maps y a llamar. */
export function ReportInfo({ report }: { report: ReportDetail }) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-slate-500">{reportCode(report.code)}</span>
        <TypeTag type={report.type} />
        <StatusBadge status={report.status} />
        <PriorityBadge priority={report.priority} />
        <PlazoTag order={report} now={Date.now()} />
        {report.category ? <span className="text-sm text-slate-600">{CATEGORY_LABEL[report.category]}</span> : null}
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

      {report.description ? (
        <div>
          <h3 className="label">{DESCRIPTION_LABEL[report.type]}</h3>
          <p className="whitespace-pre-wrap text-slate-800">{report.description}</p>
        </div>
      ) : null}

      <EquipmentTable type={report.type} equipment={report.equipment} />

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {report.type === "INSTALACION" && report.plan ? <Item label="Plan o velocidad" value={report.plan} /> : null}
        {report.type === "INSTALACION" && report.suggestedDate ? (
          <Item label="Fecha sugerida para la visita" value={formatDateOnly(report.suggestedDate)} />
        ) : null}
        {report.type === "RETIRO" && report.withdrawalReason ? (
          <Item
            label="Motivo del retiro"
            value={
              report.withdrawalReason === "OTRO" && report.withdrawalReasonOther
                ? `Otro: ${report.withdrawalReasonOther}`
                : WITHDRAWAL_REASON_LABEL[report.withdrawalReason]
            }
          />
        ) : null}
        <Item label="Cliente" value={`${report.clientName} · ${report.clientPhone}`} />
        <Item label="Número de contrato" value={report.contractNumber ?? "Sin registrar"} />
        <Item label="Técnico" value={report.assignedTo?.name ?? "Sin asignar"} />
        <Item label="Creado" value={`${formatDateTime(report.createdAt)} por ${report.createdBy.name}`} />
        <Item label="Vence" value={formatDueDate(report.dueAt)} />
        {report.completedAt && report.metDeadline !== null ? (
          <Item label="Realizado" value={`${formatDateTime(report.completedAt)} · ${report.metDeadline ? "a tiempo" : "fuera de plazo"}`} />
        ) : null}
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
