/** Avisos dentro de la app (campanita). Cada usuario solo ve y marca los suyos. */
import type { DeadlineThreshold } from "@prisma/client";
import type { Role } from "@/domain/types";
import { prisma } from "./db";

export type NotificationItem = {
  id: string;
  message: string;
  threshold: DeadlineThreshold;
  read: boolean;
  createdAt: string;
  href: string;
};

export type NotificationSummary = { unread: number; items: NotificationItem[] };

const LIMIT = 20;

export async function getNotificationSummary(user: { id: string; role: Role }): Promise<NotificationSummary> {
  const [unread, rows] = await prisma.$transaction([
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIMIT,
      select: { id: true, message: true, threshold: true, read: true, createdAt: true, reportId: true },
    }),
  ]);
  const base = user.role === "ADMIN" ? "/admin/reportes" : "/tecnico/reportes";
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      message: r.message,
      threshold: r.threshold,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
      href: `${base}/${r.reportId}`,
    })),
  };
}

/** Marca un aviso como leído (solo si es del usuario). */
export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}
