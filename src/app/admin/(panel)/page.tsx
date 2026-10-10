import type { Metadata } from "next";
import { orderTypeFromSlug } from "@/domain/labels";
import { hasPendingPickup } from "@/components/equipment-table";
import { listDeadlineConfig } from "@/server/deadline-config";
import { countByStatusAndType, deadlineCompliance, listPanelOrders } from "@/server/reports";
import { requireRole } from "@/server/session";
import { listActiveTechniciansForSelect } from "@/server/users";
import { PrioridadesPanel, type PanelOrder } from "./prioridades-panel";

export const metadata: Metadata = { title: "Panel" };

/**
 * Panel de prioridades. Carga todo en paralelo (sin N+1): conteos por estado y tipo, órdenes de los
 * carriles, configuración de plazos, cumplimiento de 30 días y técnicos activos para reasignar.
 */
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireRole("ADMIN");
  const now = new Date();
  const [counts, orders, config, compliance, technicians, sp] = await Promise.all([
    countByStatusAndType(),
    listPanelOrders(),
    listDeadlineConfig(),
    deadlineCompliance(now),
    listActiveTechniciansForSelect(),
    searchParams,
  ]);

  // "plazo de 72 h por orden" si los tres tipos tienen el mismo; si no, "plazo según el tipo".
  const hours = [...new Set(config.map((c) => c.deadlineHours))];
  const warn = [...new Set(config.map((c) => c.warnFromHours))];
  const plazoLabel = hours.length === 1 ? `plazo de ${hours[0]} h por orden` : "plazo según el tipo";
  const warnLabel = warn.length === 1 ? `Llevan más de ${warn[0]} h abiertas.` : "Ya pasaron su hora de aviso.";

  const items: PanelOrder[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    type: o.type,
    street: o.street,
    neighborhood: o.neighborhood,
    city: o.city,
    status: o.status,
    version: o.version,
    assignedToId: o.assignedToId,
    technician: o.assignedTo?.name ?? null,
    createdAt: o.createdAt,
    dueAt: o.dueAt,
    warnFromHours: o.warnFromHours,
    completedAt: o.completedAt,
    pendingPickup: hasPendingPickup(o.type, o.equipment),
  }));

  return (
    <PrioridadesPanel
      orders={items}
      counts={counts}
      compliance={compliance}
      technicians={technicians}
      plazoLabel={plazoLabel}
      warnLabel={warnLabel}
      now={now.getTime()}
      initialType={orderTypeFromSlug(sp.tipo) ?? null}
    />
  );
}
