/** Ajustes → Plazos: horas del plazo y del aviso por tipo de orden. */
import type { OrderType } from "@prisma/client";
import { ORDER_TYPES } from "@/domain/types";
import { prisma } from "./db";

export type DeadlineConfigRow = { type: OrderType; deadlineHours: number; warnFromHours: number };

/** Los tres tipos, en orden; los que no tengan fila salen con 72 h y aviso desde las 24 h. */
export async function listDeadlineConfig(): Promise<DeadlineConfigRow[]> {
  const rows = await prisma.deadlineConfig.findMany();
  return ORDER_TYPES.map((type) => {
    const r = rows.find((x) => x.type === type);
    return { type, deadlineHours: r?.deadlineHours ?? 72, warnFromHours: r?.warnFromHours ?? 24 };
  });
}

/** Los cambios solo se aplican a órdenes nuevas: las existentes guardan su propio plazo (dueAt). */
export async function saveDeadlineConfig(rows: DeadlineConfigRow[]): Promise<void> {
  await prisma.$transaction(
    rows.map((r) =>
      prisma.deadlineConfig.upsert({
        where: { type: r.type },
        create: { type: r.type, deadlineHours: r.deadlineHours, warnFromHours: r.warnFromHours },
        update: { deadlineHours: r.deadlineHours, warnFromHours: r.warnFromHours },
      }),
    ),
  );
}
