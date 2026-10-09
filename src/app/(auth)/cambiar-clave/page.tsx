import type { Metadata } from "next";
import Link from "next/link";
import { homeFor, requireUser } from "@/server/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">Cambiar contraseña</h1>
      <p className="mb-6 text-slate-600">
        {user.mustChangePassword
          ? `Hola, ${user.name}. Por seguridad, cree una contraseña nueva antes de continuar.`
          : "Escriba su contraseña actual y la nueva."}
      </p>
      <ChangePasswordForm />
      {!user.mustChangePassword ? (
        <Link href={homeFor(user.role)} className="btn btn-ghost mt-4">
          Volver
        </Link>
      ) : null}
    </main>
  );
}
