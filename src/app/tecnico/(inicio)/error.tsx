"use client";

export default function HomeError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-[18px] bg-white px-4 py-7 text-center">
      <h1 className="text-lg font-extrabold text-[#0F172A]">No se pudieron cargar los reportes</h1>
      <p className="mt-1 text-sm text-[#475569]">Puede ser la conexión. Intente de nuevo.</p>
      <button type="button" onClick={() => retry()} className="btn btn-primary mt-5">
        Reintentar
      </button>
    </div>
  );
}
