import type { Metadata } from "next";
import { AUDIT_ACTION_LABEL, CATEGORY_LABEL, STATUS_LABEL } from "@/domain/labels";
import type { ReportStatus } from "@/domain/types";
import { TIME_ZONE } from "@/lib/dates";
import { countByStatus, listReviewInbox, listReviewInboxHistory } from "@/server/reports";
import { requireRole } from "@/server/session";
import { BandejaPanel, type InboxEvent, type InboxFilter, type InboxItem } from "./bandeja-panel";

export const metadata: Metadata = { title: "Panel" };

// "9/10, 12:00 p. m." en hora de Colombia.
const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });

const FILTERS: InboxFilter[] = ["todos", "realizado", "aplazado", "ausente"];

/** Nota visible del evento: comentario del admin, o la nota/motivo que dejó el técnico. */
function eventNote(comment: string | null, data: unknown): string | null {
  if (comment) return comment;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const k of ["nota", "motivo"]) if (typeof d[k] === "string" && d[k]) return d[k] as string;
  }
  return null;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ f?: string; id?: string }> }) {
  await requireRole("ADMIN");
  const [counts, reports, history, sp] = await Promise.all([countByStatus(), listReviewInbox(), listReviewInboxHistory(), searchParams]);

  const byReport = new Map<string, InboxEvent[]>();
  for (const h of history) {
    if (!h.reportId) continue;
    const list = byReport.get(h.reportId) ?? [];
    list.push({
      id: String(h.id),
      label: AUDIT_ACTION_LABEL[h.action] ?? h.action,
      actor: h.actor?.name ?? null,
      at: fmt.format(h.createdAt),
      note: eventNote(h.comment, h.data),
      status: h.toStatus,
    });
    byReport.set(h.reportId, list);
  }

  const items: InboxItem[] = reports.map((r) => ({
    id: r.id,
    code: r.code,
    street: r.street,
    neighborhood: r.neighborhood,
    city: r.city,
    category: CATEGORY_LABEL[r.category],
    priority: r.priority,
    status: r.status as InboxItem["status"],
    technician: r.assignedTo?.name ?? null,
    client: r.clientName ? `${r.clientName} · ${r.clientPhone}` : null,
    updatedLabel: fmt.format(r.updatedAt),
    // Reportes viejos sin bitácora: solo lo que se sabe (creación y estado actual), sin inventar pasos.
    history: byReport.get(r.id) ?? [
      { id: `${r.id}-crear`, label: "Reporte creado", actor: null, at: fmt.format(r.createdAt), note: null, status: "PENDIENTE" as ReportStatus },
      { id: `${r.id}-actual`, label: STATUS_LABEL[r.status], actor: null, at: fmt.format(r.updatedAt), note: null, status: r.status },
    ],
  }));

  const filter = FILTERS.find((f) => f === sp.f) ?? "todos";
  const code = Number(/^R-(\d{1,9})$/i.exec(sp.id ?? "")?.[1]);
  return <BandejaPanel items={items} counts={counts} initialFilter={filter} initialCode={Number.isInteger(code) && code > 0 ? code : null} />;
}
