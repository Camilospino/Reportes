"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Botón de envío que se deshabilita mientras el formulario se procesa (evita doble envío). */
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  className = "btn btn-primary",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
