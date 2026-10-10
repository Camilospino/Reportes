/**
 * Esquemas de validación (Zod) compartidos por el navegador y el servidor.
 * El servidor SIEMPRE vuelve a validar: lo del navegador es solo para dar respuesta rápida.
 */
import { z } from "zod";
import { CATEGORIES, EQUIPMENT_CONDITIONS, ORDER_TYPES, PRIORITIES, WITHDRAWAL_REASONS } from "./types";
import { NIVELES_PLAZO } from "@/lib/plazo";
import { SERVICE_CITY } from "./location";
import {
  DATE_RE,
  DATETIME_LOCAL_RE,
  bogotaDateString,
  parseBogotaDateTimeLocal,
} from "@/lib/dates";

/** Texto obligatorio: recorta espacios y exige contenido. */
const requiredText = (max: number, message = "Este campo es obligatorio.") =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .max(max, `Máximo ${max} caracteres.`);

/** Texto opcional: cadena vacía se convierte en undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Teléfono colombiano: fijo o celular, con o sin +57. Se guarda solo con dígitos (y + inicial). */
export const phoneSchema = z
  .string({ required_error: "Ingrese el teléfono." })
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine((v) => /^\+?\d{7,13}$/.test(v), "Teléfono no válido. Use solo números, ej.: 3001234567.");

/** Número de contrato: letras, números y guiones. Se guarda en mayúsculas y sin espacios. */
export const contractNumberSchema = z
  .string({ required_error: "Ingrese el número de contrato." })
  .trim()
  .min(1, "Ingrese el número de contrato.")
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine((v) => /^[A-Z0-9-]{3,30}$/.test(v), "Número de contrato no válido: de 3 a 30 letras, números o guiones.");

const uuid = z.string().uuid("Identificador no válido.");

// ─── Reportes ──────────────────────────────────────────────────────────

/** Campos comunes a los tres tipos de orden: dirección, cliente, prioridad y técnico. */
const commonReportFields = {
  street: requiredText(200, "Ingrese la calle o dirección."),
  neighborhood: requiredText(120, "Ingrese el barrio."),
  /** Solo se opera en Cartagena: se ignora lo que envíe el navegador. */
  city: z.literal(SERVICE_CITY).catch(SERVICE_CITY),
  referencePoint: optionalText(200),
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: "Seleccione la prioridad." }) }),
  clientName: requiredText(120, "Ingrese el nombre del cliente."),
  clientPhone: phoneSchema,
  contractNumber: contractNumberSchema,
  assignedToId: z
    .union([uuid, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
};

/** Un equipo de una instalación o un retiro, al crear la orden: tipo y, si se conoce, serial. */
export const equipmentInputSchema = z.object({
  /** Solo al editar: equipo que ya existe (conserva sus datos de cierre). */
  id: uuid.optional(),
  kind: requiredText(40, "Indique el tipo de cada equipo."),
  serial: optionalText(80),
});
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

const equipmentListSchema = z
  .array(equipmentInputSchema, { required_error: "Agregue al menos un equipo.", invalid_type_error: "Agregue al menos un equipo." })
  .min(1, "Agregue al menos un equipo.")
  .max(10, "Máximo 10 equipos.");

/**
 * Datos de una orden según su tipo (Daño, Instalación o Retiro). Sin `type` se asume Daño,
 * como antes de existir los tipos. `futureDates`: al crear, la fecha sugerida no puede ser pasada.
 */
function makeReportInputSchema({ futureDates }: { futureDates: boolean }) {
  const suggestedDate = z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || DATE_RE.test(v), "Fecha no válida.")
    .refine((v) => !futureDates || v === undefined || v >= bogotaDateString(), "La fecha sugerida no puede ser anterior a hoy.");
  const union = z.discriminatedUnion("type", [
    z.object({
      ...commonReportFields,
      type: z.literal("DANO"),
      category: z.enum(CATEGORIES, { errorMap: () => ({ message: "Seleccione la categoría." }) }),
      description: requiredText(2000, "Describa el posible daño."),
    }),
    z.object({
      ...commonReportFields,
      type: z.literal("INSTALACION"),
      plan: requiredText(60, "Indique el plan o la velocidad."),
      suggestedDate,
      description: optionalText(2000),
      equipment: equipmentListSchema,
    }),
    z.object({
      ...commonReportFields,
      type: z.literal("RETIRO"),
      withdrawalReason: z.enum(WITHDRAWAL_REASONS, { errorMap: () => ({ message: "Seleccione el motivo del retiro." }) }),
      withdrawalReasonOther: optionalText(200),
      description: optionalText(2000),
      equipment: equipmentListSchema,
    }),
  ]);
  return z
    .preprocess((v) => (v && typeof v === "object" && !(v as { type?: unknown }).type ? { ...v, type: "DANO" } : v), union)
    .superRefine((v, ctx) => {
      if (v.type === "RETIRO" && v.withdrawalReason === "OTRO" && !v.withdrawalReasonOther) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["withdrawalReasonOther"], message: "Escriba el motivo del retiro." });
      }
    });
}

export const reportInputSchema = makeReportInputSchema({ futureDates: true });
/** Al editar no se exige fecha futura: la sugerida pudo quedar en el pasado. */
export const reportEditSchema = makeReportInputSchema({ futureDates: false });
export type ReportInput = z.infer<typeof reportInputSchema>;

export const versionSchema = z.coerce.number().int().min(0);

/** Ajustes → Plazos: horas del plazo y desde cuándo avisar, por tipo de orden. */
export const deadlineConfigSchema = z
  .array(
    z.object({
      type: z.enum(ORDER_TYPES),
      deadlineHours: z.coerce
        .number({ invalid_type_error: "Ingrese un número de horas." })
        .int("Use horas enteras.")
        .min(1, "Mínimo 1 hora.")
        .max(720, "Máximo 720 horas (30 días)."),
      warnFromHours: z.coerce
        .number({ invalid_type_error: "Ingrese un número de horas." })
        .int("Use horas enteras.")
        .min(1, "Mínimo 1 hora."),
    }),
  )
  .length(ORDER_TYPES.length)
  .superRefine((rows, ctx) => {
    rows.forEach((r, i) => {
      if (r.warnFromHours >= r.deadlineHours) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "warnFromHours"], message: "El aviso debe empezar antes de que venza el plazo." });
      }
    });
    if (new Set(rows.map((r) => r.type)).size !== rows.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tipos repetidos." });
    }
  });

// ─── Cambios de estado ─────────────────────────────────────────────────

const requestId = uuid;

/**
 * Cierre de un equipo al marcar Realizado. Instalación: serial (obligatorio si el equipo aún no lo
 * tiene). Retiro: recibido sí/no y, si se recibió, su estado. Las reglas por tipo se validan en el
 * servidor contra los equipos de la orden (applyTransition), no solo aquí.
 */
export const equipmentClosingSchema = z.object({
  id: uuid,
  serial: optionalText(80),
  received: z.boolean().optional(),
  condition: z.enum(EQUIPMENT_CONDITIONS).optional(),
  observation: optionalText(300),
});
export type EquipmentClosingInput = z.infer<typeof equipmentClosingSchema>;

/** Resultado de la visita del técnico. */
export const outcomeSchema = z.discriminatedUnion("transition", [
  z.object({
    transition: z.literal("REALIZADO"),
    reportId: uuid,
    requestId,
    note: optionalText(1000),
    attachmentIds: z
      .array(uuid)
      .min(1, "Debe subir al menos una foto como evidencia.")
      .max(10, "Máximo 10 fotos."),
    /** Instalaciones y retiros: datos de cierre de cada equipo (se validan contra la orden en el servidor). */
    equipment: z.array(equipmentClosingSchema).max(10).default([]),
  }),
  z.object({
    transition: z.literal("APLAZADO"),
    reportId: uuid,
    requestId,
    reason: requiredText(1000, "Indique el motivo del aplazamiento."),
    newDate: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || DATE_RE.test(v), "Fecha no válida.")
      .refine((v) => v === undefined || v >= bogotaDateString(), "La nueva fecha no puede ser anterior a hoy."),
  }),
  z.object({
    transition: z.literal("CLIENTE_AUSENTE"),
    reportId: uuid,
    requestId,
    attemptedAt: z
      .string({ required_error: "Indique la fecha y hora del intento." })
      .regex(DATETIME_LOCAL_RE, "Indique la fecha y hora del intento.")
      // Se permiten 5 minutos de tolerancia por diferencias de reloj del celular.
      .refine(
        (v) => parseBogotaDateTimeLocal(v).getTime() <= Date.now() + 5 * 60_000,
        "La fecha del intento no puede ser futura.",
      ),
    attachmentIds: z.array(uuid).max(5, "Máximo 5 fotos.").default([]),
  }),
]);
export type OutcomeInput = z.input<typeof outcomeSchema>;

/** Tomar o liberar un reporte (técnico). */
export const technicianSimpleSchema = z.object({
  transition: z.enum(["TOMAR", "LIBERAR"]),
  reportId: uuid,
  requestId,
});

/** Tomar o iniciar desde la pantalla de inicio del técnico. */
export const reportActionSchema = z.object({ reportId: uuid, requestId });

/** Marcar realizado desde la pantalla de inicio (mismas reglas que el resultado REALIZADO). */
export const completeSchema = outcomeSchema.options[0].omit({ transition: true });

/** Decisiones del administrador. Rechazar, reprogramar y cancelar exigen comentario. */
export const adminDecisionSchema = z
  .object({
    transition: z.enum(["VERIFICAR", "RECHAZAR", "REPROGRAMAR", "CANCELAR"]),
    reportId: uuid,
    requestId,
    comment: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.transition !== "VERIFICAR" && (!v.comment || v.comment.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Escriba un comentario (mínimo 5 caracteres) explicando la decisión.",
      });
    }
  });

/** Decisión desde la bandeja del Panel: la nota para el técnico es opcional. */
export const panelDecisionSchema = z.object({
  id: uuid,
  requestId,
  nota: optionalText(500),
});

// ─── Listado / filtros ─────────────────────────────────────────────────

export const REPORT_SORTS = [
  "vence-asc",
  "vence-desc",
  "creado-desc",
  "creado-asc",
  "codigo-desc",
  "codigo-asc",
  "prioridad-desc",
  "prioridad-asc",
] as const;
export type ReportSort = (typeof REPORT_SORTS)[number];

/** Filtros del listado del admin (vienen de la URL; lo inválido se ignora). */
export const reportFiltersSchema = z.object({
  estado: z.string().optional(),
  prioridad: z.string().optional(),
  tecnico: z.string().optional(),
  desde: z.string().regex(DATE_RE).optional().catch(undefined),
  hasta: z.string().regex(DATE_RE).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  /** Tipo de orden (pestañas): dano, instalacion o retiro. */
  tipo: z.enum(["dano", "instalacion", "retiro"]).optional().catch(undefined),
  /** Nivel del plazo: a-tiempo, atencion, por-vencer o vencido. */
  plazo: z.enum(NIVELES_PLAZO).optional().catch(undefined),
  /** Orden de la tabla: campo y sentido. Por defecto, lo que vence primero. */
  orden: z.enum(REPORT_SORTS).catch("vence-asc").default("vence-asc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

/** Asignar o quitar el técnico de un reporte desde la lista (sin editar el resto). */
export const assignTechnicianSchema = z.object({
  reportId: uuid,
  assignedToId: z.union([uuid, z.null()]),
  version: z.number().int().min(0),
});

// ─── Usuarios y autenticación ──────────────────────────────────────────

export const usernameSchema = z
  .string({ required_error: "Ingrese el usuario." })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "Usuario de 3 a 30 caracteres: letras, números, punto, guion.");

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Ingrese el usuario.").max(50),
  password: z.string().min(1, "Ingrese la contraseña.").max(128),
});

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres.")
  .max(128, "Máximo 128 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Debe contener letras y números.");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingrese su contraseña actual.").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "La nueva contraseña debe ser diferente a la actual.",
  });

export const technicianCreateSchema = z.object({
  name: requiredText(120, "Ingrese el nombre completo."),
  username: usernameSchema,
  phone: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v : undefined))
    .pipe(phoneSchema.optional()),
});

export const userIdSchema = z.object({ userId: uuid });

/** Convierte errores de Zod al formato { campo: [mensajes] } que consumen los formularios. */
export function fieldErrors(error: z.ZodError): Record<string, string[] | undefined> {
  return error.flatten().fieldErrors as Record<string, string[] | undefined>;
}
