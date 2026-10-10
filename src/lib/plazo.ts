/**
 * Plazo de las órdenes. ÚNICA fuente de verdad del nivel de alerta: la usan el servidor (avisos,
 * conteos, filtros) y el navegador (etiquetas que se actualizan solas). Función pura, sin E/S.
 *
 * - El plazo se cuenta en horas corridas desde la creación hasta `dueAt` (72 h por defecto).
 * - El reloj corre en Pendiente, En proceso, Aplazado y Cliente ausente.
 * - Se detiene en Realizado (cuenta hasta completedAt). Si el admin la devuelve, sigue con el mismo dueAt.
 * - Verificado y Cancelado no tienen plazo activo.
 */
import type { DeadlineThreshold, ReportStatus } from "@/domain/types";

export const NIVELES_PLAZO = ["a-tiempo", "atencion", "por-vencer", "vencido"] as const;
export type NivelPlazo = (typeof NIVELES_PLAZO)[number];

export type Plazo = {
  /** "detenido": Realizado (reloj parado). "sin-plazo": Verificado o Cancelado. */
  nivel: NivelPlazo | "detenido" | "sin-plazo";
  horasTranscurridas: number;
  /** Negativo cuando ya venció. */
  horasRestantes: number;
  texto: string;
};

export type PlazoOrden = {
  status: ReportStatus;
  createdAt: Date | string;
  dueAt: Date | string;
  /** Cuándo se marcó Realizado (detiene el reloj). */
  completedAt?: Date | string | null;
};

export type PlazoConfig = {
  /** Desde cuántas horas se pasa a "Atención" (24 por defecto). */
  avisoDesdeHoras: number;
};

/** Estados en los que el reloj corre. */
export const PLAZO_ACTIVE_STATUSES = ["PENDIENTE", "EN_PROCESO", "APLAZADO", "CLIENTE_AUSENTE"] as const satisfies readonly ReportStatus[];

export const NIVEL_LABEL: Record<NivelPlazo, string> = {
  "a-tiempo": "A tiempo",
  atencion: "Atención",
  "por-vencer": "Por vencer",
  vencido: "Vencido",
};

/** Umbral de aviso que corresponde a cada nivel (A tiempo no avisa). */
export const UMBRAL_DE_NIVEL: Record<NivelPlazo, DeadlineThreshold | null> = {
  "a-tiempo": null,
  atencion: "H24",
  "por-vencer": "H48",
  vencido: "VENCIDO",
};

const HOUR = 3_600_000;

/** Horas totales del plazo de la orden (dueAt − createdAt). */
export function plazoHoras(o: Pick<PlazoOrden, "createdAt" | "dueAt">): number {
  return (new Date(o.dueAt).getTime() - new Date(o.createdAt).getTime()) / HOUR;
}

/**
 * Cortes de los niveles: Atención desde `avisoDesdeHoras`, Por vencer desde los 2/3 del plazo y
 * Vencido al cumplirlo. Con la configuración por defecto: 24 h, 48 h y 72 h.
 */
export function cortesPlazo(plazo: number, config: PlazoConfig) {
  return { atencion: config.avisoDesdeHoras, porVencer: (plazo * 2) / 3, vencido: plazo };
}

export function calcularPlazo(orden: PlazoOrden, config: PlazoConfig, ahora: Date = new Date()): Plazo {
  const created = new Date(orden.createdAt).getTime();
  const due = new Date(orden.dueAt).getTime();
  const plazo = (due - created) / HOUR;

  if (orden.status === "VERIFICADO" || orden.status === "CANCELADO") {
    const end = orden.completedAt ? new Date(orden.completedAt).getTime() : ahora.getTime();
    return { nivel: "sin-plazo", horasTranscurridas: (end - created) / HOUR, horasRestantes: (due - end) / HOUR, texto: "" };
  }

  if (orden.status === "REALIZADO") {
    const end = orden.completedAt ? new Date(orden.completedAt).getTime() : ahora.getTime();
    const restantes = (due - end) / HOUR;
    const texto = restantes >= 0 ? "Cumplió el plazo" : `Fuera de plazo por ${horasTexto(-restantes)}`;
    return { nivel: "detenido", horasTranscurridas: (end - created) / HOUR, horasRestantes: restantes, texto };
  }

  const transcurridas = (ahora.getTime() - created) / HOUR;
  const restantes = plazo - transcurridas;
  const cortes = cortesPlazo(plazo, config);
  const nivel: NivelPlazo =
    transcurridas >= cortes.vencido
      ? "vencido"
      : transcurridas >= cortes.porVencer
        ? "por-vencer"
        : transcurridas >= cortes.atencion
          ? "atencion"
          : "a-tiempo";
  const texto =
    nivel === "vencido"
      ? -restantes < 1
        ? "Vencido hace menos de 1 h"
        : `Vencido hace ${Math.floor(-restantes)} h`
      : restantes < 1
        ? "Vence en menos de 1 h"
        : `Vence en ${Math.ceil(restantes)} h`;
  return { nivel, horasTranscurridas: transcurridas, horasRestantes: restantes, texto };
}

/** "5 h" o "menos de 1 h". */
function horasTexto(h: number): string {
  return h < 1 ? "menos de 1 h" : `${Math.floor(h)} h`;
}

/** Atajo para órdenes que guardan su propio umbral de aviso (warnFromHours). */
export function plazoDeOrden(o: PlazoOrden & { warnFromHours: number }, ahora?: Date): Plazo {
  return calcularPlazo(o, { avisoDesdeHoras: o.warnFromHours }, ahora);
}
