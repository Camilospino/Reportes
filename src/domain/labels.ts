/** Textos en español (Colombia) para enums y acciones de bitácora. */
import type { AttachmentKind, DamageCategory, Priority, ReportStatus } from "./types";

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
  priority: "Prioridad",
  clientName: "Nombre del cliente",
  clientPhone: "Teléfono del cliente",
  contractNumber: "Número de contrato",
  assignedToId: "Técnico asignado",
};

export function reportCode(code: number): string {
  return `R-${String(code).padStart(6, "0")}`;
}
