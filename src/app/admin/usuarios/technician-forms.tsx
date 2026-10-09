"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/alert";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";
import { NETWORK_ERROR_MSG } from "@/lib/client-utils";
import {
  createTechnicianAction,
  resetTechnicianPasswordAction,
  setTechnicianActiveAction,
} from "../actions";

/** Muestra la contraseña temporal UNA sola vez (no se guarda en claro en ningún lado). */
function TempPasswordNotice({ username, tempPassword }: { username: string; tempPassword: string }) {
  return (
    <Alert kind="success">
      <p>Entregue estos datos al técnico. La contraseña no se volverá a mostrar:</p>
      <p className="mt-2 font-mono text-lg">
        Usuario: <strong>{username}</strong>
        <br />
        Contraseña temporal: <strong className="select-all">{tempPassword}</strong>
      </p>
      <p className="mt-1 text-sm">Al ingresar, el sistema le pedirá crear una contraseña propia.</p>
    </Alert>
  );
}

export function CreateTechnicianForm() {
  const [state, action] = useActionState(createTechnicianAction, null);
  const e = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">Crear técnico</h2>
      {state?.ok ? <TempPasswordNotice {...state.data} /> : null}
      {state && !state.ok ? <Alert kind="error">{state.error}</Alert> : null}
      <form action={action} className="grid gap-4 sm:grid-cols-3">
        <TextField label="Nombre completo *" name="name" required maxLength={120} errors={e?.name} />
        <TextField
          label="Usuario *"
          name="username"
          required
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ej.: jperez"
          errors={e?.username}
        />
        <TextField label="Teléfono" name="phone" type="tel" inputMode="tel" maxLength={20} errors={e?.phone} />
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Creando…">Crear técnico</SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function TechnicianRowActions({
  userId,
  name,
  active,
  inProgress,
}: {
  userId: string;
  name: string;
  active: boolean;
  inProgress: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ username: string; tempPassword: string } | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError(NETWORK_ERROR_MSG);
    } finally {
      setBusy(false);
    }
  }

  const toggle = () =>
    run(async () => {
      const msg = active
        ? `¿Desactivar a ${name}? Se cerrará su sesión y no podrá ingresar.` +
          (inProgress > 0 ? `\n\nTiene ${inProgress} reporte(s) en proceso: revíselos y reasígnelos.` : "")
        : `¿Activar de nuevo a ${name}?`;
      if (!window.confirm(msg)) return;
      const res = await setTechnicianActiveAction(userId, !active);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  const resetPassword = () =>
    run(async () => {
      if (!window.confirm(`¿Restablecer la contraseña de ${name}? Se cerrará su sesión.`)) return;
      const res = await resetTechnicianPasswordAction(userId);
      if (!res.ok) setError(res.error);
      else setTemp(res.data);
    });

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {active ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={resetPassword}>
            Restablecer contraseña
          </button>
        ) : null}
        <button type="button" className={active ? "btn btn-danger" : "btn btn-success"} disabled={busy} onClick={toggle}>
          {active ? "Desactivar" : "Activar"}
        </button>
      </div>
      {temp ? <TempPasswordNotice {...temp} /> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
    </div>
  );
}
