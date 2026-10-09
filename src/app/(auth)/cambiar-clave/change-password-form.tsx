"use client";

import { useActionState } from "react";
import { Alert } from "@/components/alert";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";
import { changePasswordAction } from "../actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="card space-y-4">
      {state && !state.ok ? <Alert kind="error">{state.error}</Alert> : null}
      <TextField
        label="Contraseña actual (o temporal)"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        errors={errors?.currentPassword}
      />
      <TextField
        label="Nueva contraseña"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo 8 caracteres, con letras y números."
        errors={errors?.newPassword}
      />
      <TextField
        label="Repita la nueva contraseña"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={errors?.confirmPassword}
      />
      <SubmitButton className="btn btn-primary btn-lg">Guardar contraseña</SubmitButton>
    </form>
  );
}
