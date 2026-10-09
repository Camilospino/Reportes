"use client";

import { useActionState } from "react";
import { Alert } from "@/components/alert";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="card space-y-4">
      {state && !state.ok ? <Alert kind="error">{state.error}</Alert> : null}
      <TextField
        label="Usuario"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        errors={errors?.username}
      />
      <TextField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={errors?.password}
      />
      <SubmitButton className="btn btn-primary btn-lg" pendingText="Ingresando…">
        Ingresar
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">¿Olvidó su contraseña? Pídale al administrador que la restablezca.</p>
    </form>
  );
}
