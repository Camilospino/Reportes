import Link from "next/link";
import { CATEGORY_LABEL, reportCode } from "@/domain/labels";
import type { DamageCategory, Priority, ReportStatus } from "@/domain/types";
import { formatDateTime } from "@/lib/dates";
import { PriorityBadge, StatusBadge } from "./badges";

export type ReportListItem = {
  id: string;
  code: number;
  street: string;
  neighborhood: string;
  city: string;
  category: DamageCategory;
  priority: Priority;
  status: ReportStatus;
  createdAt: Date;
  assignedTo: { name: string } | null;
};

/** Tarjeta táctil para listados en celular: toda la tarjeta es el enlace. */
export function ReportCard({ report, href, showTechnician = false }: { report: ReportListItem; href: string; showTechnician?: boolean }) {
  return (
    <Link href={href} className="card block transition hover:border-brand-600 active:bg-slate-50">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={report.status} />
        <PriorityBadge priority={report.priority} />
        <span className="ml-auto font-mono text-xs text-slate-500">{reportCode(report.code)}</span>
      </div>
      <p className="mt-2 text-lg font-bold leading-tight">{report.street}</p>
      <p className="text-slate-700">
        {report.neighborhood}, {report.city}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {CATEGORY_LABEL[report.category]} · {formatDateTime(report.createdAt)}
        {showTechnician ? ` · ${report.assignedTo?.name ?? "Sin asignar"}` : ""}
      </p>
    </Link>
  );
}
