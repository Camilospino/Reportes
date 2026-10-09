/**
 * Tipos de dominio. Se duplican como uniones de texto (en vez de importar los enums de Prisma)
 * para que este módulo pueda usarse en el navegador sin arrastrar @prisma/client.
 * `tests/unit/enums.test.ts` verifica que coincidan con el schema de Prisma.
 */

export const ROLES = ["ADMIN", "TECNICO"] as const;
export type Role = (typeof ROLES)[number];

export const REPORT_STATUSES = [
  "PENDIENTE",
  "EN_PROCESO",
  "REALIZADO",
  "APLAZADO",
  "CLIENTE_AUSENTE",
  "VERIFICADO",
  "CANCELADO",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const CATEGORIES = ["SIN_SERVICIO", "LENTITUD", "FIBRA_CABLEADO", "EQUIPO", "WIFI", "OTRO"] as const;
export type DamageCategory = (typeof CATEGORIES)[number];

export const PRIORITIES = ["ALTA", "MEDIA", "BAJA"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ATTACHMENT_KINDS = ["EVIDENCIA", "FACHADA"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Resultado estándar de las Server Actions. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
