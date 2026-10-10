/** Textos en español (Colombia) para enums y acciones de bitácora. */
import type {
  AttachmentKind,
  DamageCategory,
  EquipmentAction,
  EquipmentCondition,
  OrderType,
  Priority,
  ReportStatus,
  WithdrawalReason,
} from "./types";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  REALIZADO: "Realizado",
  APLAZADO: "Aplazado",
  CLIENTE_AUSENTE: "Cliente ausente",
  VERIFICADO: "Verificado",
  CANCELADO: "Cancelado",
};

export const CATEGORY_LABEL: Record<DamageCategory, string> = {
  SIN_SERVICIO: "Sin servicio",
  LENTITUD: "Internet lento o intermitente",
  FIBRA_CABLEADO: "Fibra o cableado dañado",
  EQUIPO: "Router / ONT dañado",
  WIFI: "Wi-Fi sin cobertura",
  OTRO: "Otro",
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DANO: "Daño",
  INSTALACION: "Instalación",
  RETIRO: "Retiro de equipos",
};

/** Tipo en la URL (?tipo=) ↔ enum. */
export const ORDER_TYPE_SLUG: Record<OrderType, "dano" | "instalacion" | "retiro"> = {
  DANO: "dano",
  INSTALACION: "instalacion",
  RETIRO: "retiro",
};
export function orderTypeFromSlug(slug: string | undefined): OrderType | undefined {
  return (Object.keys(ORDER_TYPE_SLUG) as OrderType[]).find((t) => ORDER_TYPE_SLUG[t] === slug);
}

/** Etiqueta corta (pestañas y etiquetas de tipo en listas). */
export const ORDER_TYPE_SHORT: Record<OrderType, string> = {
  DANO: "Daño",
  INSTALACION: "Instalación",
  RETIRO: "Retiro",
};

export const WITHDRAWAL_REASON_LABEL: Record<WithdrawalReason, string> = {
  CANCELACION: "Cancelación del servicio",
  CAMBIO_EQUIPO: "Cambio de equipo",
  MORA: "Mora",
  OTRO: "Otro",
};

export const EQUIPMENT_ACTION_LABEL: Record<EquipmentAction, string> = {
  INSTALAR: "Instalar",
  RETIRAR: "Retirar",
};

export const EQUIPMENT_CONDITION_LABEL: Record<EquipmentCondition, string> = {
  BUENO: "Bueno",
  DANADO: "Dañado",
  INCOMPLETO: "Incompleto",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  EVIDENCIA: "Evidencia",
  FACHADA: "Fachada",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREAR: "Creó el reporte",
  EDITAR: "Editó el reporte",
  TOMAR: "Tomó el reporte",
  LIBERAR: "Liberó el reporte",
  REALIZADO: "Marcó como realizado",
  APLAZADO: "Aplazó el reporte",
  CLIENTE_AUSENTE: "Registró cliente ausente",
  VERIFICAR: "Verificó el cierre",
  RECHAZAR: "Rechazó el cierre",
  REPROGRAMAR: "Reprogramó el reporte",
  CANCELAR: "Canceló el reporte",
  PLAZO_POR_VENCER: "Pasó a Por vencer",
  PLAZO_VENCIDO: "Venció el plazo",
  LOGIN_OK: "Inició sesión",
  LOGIN_FALLIDO: "Intento de inicio de sesión fallido",
  LOGOUT: "Cerró sesión",
  USUARIO_CREAR: "Creó el usuario",
  USUARIO_DESACTIVAR: "Desactivó el usuario",
  USUARIO_ACTIVAR: "Activó el usuario",
  CLAVE_RESTABLECER: "Restableció la contraseña",
  CLAVE_CAMBIAR: "Cambió su contraseña",
};

/** Nombres legibles de los campos del reporte (para mostrar diferencias al editar). */
export const REPORT_FIELD_LABEL: Record<string, string> = {
  street: "Calle",
  neighborhood: "Barrio",
  city: "Ciudad",
  referencePoint: "Punto de referencia",
  category: "Categoría",
  description: "Descripción",
  plan: "Plan o velocidad",
  suggestedDate: "Fecha sugerida",
  withdrawalReason: "Motivo del retiro",
  withdrawalReasonOther: "Otro motivo",
  equipment: "Equipos",
  priority: "Prioridad",
  clientName: "Nombre del cliente",
  clientPhone: "Teléfono del cliente",
  contractNumber: "Número de contrato",
  assignedToId: "Técnico asignado",
};

export function reportCode(code: number): string {
  return `R-${String(code).padStart(6, "0")}`;
}

/**
 * Resumen de una línea de lo que hay que hacer: la categoría en daños, el plan en instalaciones
 * y el motivo en retiros. Sirve para listas y tarjetas.
 */
export function orderSummary(r: {
  type: OrderType;
  category: DamageCategory | null;
  plan?: string | null;
  withdrawalReason?: WithdrawalReason | null;
  withdrawalReasonOther?: string | null;
}): string {
  if (r.type === "INSTALACION") return r.plan ? `Plan ${r.plan}` : "Instalación";
  if (r.type === "RETIRO") {
    if (!r.withdrawalReason) return "Retiro de equipos";
    return r.withdrawalReason === "OTRO" && r.withdrawalReasonOther
      ? `Retiro: ${r.withdrawalReasonOther}`
      : `Retiro: ${WITHDRAWAL_REASON_LABEL[r.withdrawalReason]}`;
  }
  return r.category ? CATEGORY_LABEL[r.category] : "Daño";
}
