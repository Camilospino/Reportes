"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 text-slate-600">Puede ser la conexión. Intente de nuevo.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        Reintentar
      </button>
    </main>
  );
}
