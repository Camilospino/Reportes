/**
 * Plantillas de "Nuevo reporte": llenan categoría, prioridad y descripción según el tipo de daño.
 * Se pueden editar aquí sin tocar la interfaz. Los "____" son espacios que el administrador
 * debe completar: el formulario no deja publicar mientras queden.
 */
import type { DamageCategory, Priority } from "./types";

export const TEMPLATE_BLANK = "____";

export type ReportTemplate = {
  id: string;
  title: string;
  help: string;
  /** Nombre del ícono (ver TEMPLATE_ICONS en el formulario). */
  icon: "wifi-off" | "gauge" | "cable" | "router" | "file";
  /** null = plantilla "En blanco": no llena nada. */
  fill: { category: DamageCategory; priority: Priority; description: string } | null;
};

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  {
    id: "sin-internet",
    title: "Sin internet",
    help: "Sin conexión total",
    icon: "wifi-off",
    fill: { category: "SIN_SERVICIO", priority: "ALTA", description: "Sin internet desde ____. Luces del router: ____." },
  },
  {
    id: "internet-lento",
    title: "Internet lento",
    help: "Se cae o va lento",
    icon: "gauge",
    fill: { category: "LENTITUD", priority: "MEDIA", description: "La conexión va lenta o se cae desde ____. Ocurre ____." },
  },
  {
    id: "cable-fibra",
    title: "Cable o fibra",
    help: "Cable caído o cortado",
    icon: "cable",
    // La app no tiene prioridad "Urgente": se usa la más alta que existe.
    fill: { category: "FIBRA_CABLEADO", priority: "ALTA", description: "Cable o fibra dañado en ____. Detalle: ____." },
  },
  {
    id: "router-equipo",
    title: "Router o equipo",
    help: "No enciende o falla",
    icon: "router",
    fill: {
      category: "EQUIPO",
      priority: "MEDIA",
      description: "El router ____ (no enciende / se reinicia solo / luces en rojo).",
    },
  },
  { id: "en-blanco", title: "En blanco", help: "Empezar sin plantilla", icon: "file", fill: null },
];
