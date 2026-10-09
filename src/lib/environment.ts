/**
 * Entorno en el que corre la app, para distinguir a simple vista desarrollo y QA.
 * APP_ENV se define en .env ("desarrollo") y .env.qa ("qa"); en producción no se define
 * y la app se ve normal, sin franja ni prefijo en el título.
 */
const ENVIRONMENTS = {
  desarrollo: { label: "DESARROLLO", className: "bg-emerald-600 text-white", themeColor: "#059669" },
  qa: { label: "QA", className: "bg-amber-400 text-slate-900", themeColor: "#f59e0b" },
} as const;

export const appEnvironment =
  ENVIRONMENTS[(process.env.APP_ENV ?? "").toLowerCase() as keyof typeof ENVIRONMENTS] ?? null;
