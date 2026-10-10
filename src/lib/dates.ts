/**
 * Fechas en hora de Colombia. Colombia no tiene horario de verano: siempre UTC-05:00,
 * por eso se puede usar un desfase fijo al interpretar lo que escribe el usuario.
 * Se puede importar desde el navegador y desde el servidor.
 */
export const TIME_ZONE = "America/Bogota";
const OFFSET = "-05:00";

const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, dateStyle: "medium" });
/** Para columnas DATE (llegan como medianoche UTC): se formatean en UTC para no restar un día. */
const dateOnlyFmt = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", dateStyle: "medium" });

export const formatDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d));

const timeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayMonthFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const clockFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "11:57 a. m." si es de hoy; si no, "8 oct, 11:57 a. m." (hora de Bogotá). */
export function formatShortDateTime(d: Date | string, now: Date = new Date()): string {
  const date = new Date(d);
  const time = timeFmt.format(date);
  if (bogotaDateString(date) === bogotaDateString(now)) return time;
  return `${dayMonthFmt.format(date).replace(/\sde\s/, " ").replace(/\.$/, "")}, ${time}`;
}

const weekdayFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "numeric" });

/** "sáb 10/10, 12:00 p. m." (hora de Bogotá), para vencimientos. */
export function formatDueDate(d: Date | string): string {
  const date = new Date(d);
  const p = weekdayFmt.formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("weekday").replace(".", "")} ${get("day")}/${get("month")}, ${timeFmt.format(date)}`;
}

/** "HH:MM" en 24 horas, hora de Bogotá. */
export const formatClock = (d: Date) => clockFmt.format(d);
export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatDateOnly = (d: Date | string) => dateOnlyFmt.format(new Date(d));

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** "YYYY-MM-DD" de hoy (o de la fecha dada) en Bogotá. */
export function bogotaDateString(d: Date = new Date()): string {
  const { y, m, d: day } = parts(d);
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DDTHH:mm" en Bogotá, para <input type="datetime-local">. */
export function bogotaDateTimeLocal(d: Date = new Date()): string {
  const { y, m, d: day, h, min } = parts(d);
  return `${y}-${m}-${day}T${h}:${min}`;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Interpreta "YYYY-MM-DDTHH:mm" como hora de Bogotá. */
export function parseBogotaDateTimeLocal(s: string): Date {
  return new Date(`${s}:00${OFFSET}`);
}

/** Inicio del día (00:00 Bogotá) para "YYYY-MM-DD". */
export function bogotaDayStart(s: string): Date {
  return new Date(`${s}T00:00:00${OFFSET}`);
}

/** Inicio del día siguiente (exclusivo) para "YYYY-MM-DD". */
export function bogotaNextDayStart(s: string): Date {
  return new Date(bogotaDayStart(s).getTime() + 24 * 60 * 60 * 1000);
}

/** "YYYY-MM-DD" → Date a medianoche UTC (formato que espera una columna DATE). */
export function dateOnlyToUtc(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
