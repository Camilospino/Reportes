import type { AuditEntity, Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "./db";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  actorId: string | null;
  entity: AuditEntity;
  action: string;
  reportId?: string;
  targetUserId?: string;
  fromStatus?: ReportStatus;
  toStatus?: ReportStatus;
  data?: Prisma.InputJsonValue;
  comment?: string | null;
  ip?: string | null;
  requestId?: string;
};

/**
 * Registra un evento en la bitácora. Para cambios de reportes SIEMPRE se llama con
 * el cliente de la transacción (`tx`), así el cambio y su registro se guardan juntos o ninguno.
 */
export function writeAudit(entry: AuditEntry, tx: Tx = prisma) {
  return tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      entity: entry.entity,
      action: entry.action,
      reportId: entry.reportId,
      targetUserId: entry.targetUserId,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      data: entry.data,
      comment: entry.comment ?? null,
      ip: entry.ip ?? null,
      requestId: entry.requestId,
    },
    select: { id: true },
  });
}
