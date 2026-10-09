import type { ReactNode } from "react";

const STYLE = {
  error: "border-red-300 bg-red-50 text-red-900",
  success: "border-green-300 bg-green-50 text-green-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
} as const;

export function Alert({ kind = "info", children }: { kind?: keyof typeof STYLE; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border-2 px-4 py-3 font-medium ${STYLE[kind]}`}>
      {children}
    </div>
  );
}

/** Mensajes de confirmación que llegan por ?msg= tras una redirección. */
const FLASH: Record<string, string> = {
  creado: "Reporte creado y publicado como Pendiente.",
  editado: "Cambios guardados.",
  clave: "Contraseña actualizada.",
  enviado: "Resultado enviado. ¡Gracias!",
  liberado: "Reporte liberado.",
};

export function Flash({ msg }: { msg?: string | string[] }) {
  const text = typeof msg === "string" ? FLASH[msg] : undefined;
  return text ? <Alert kind="success">{text}</Alert> : null;
}
