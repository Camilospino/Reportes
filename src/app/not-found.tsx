import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">No encontrado</h1>
      <p className="mt-2 text-slate-600">La página o el reporte no existe, o no tiene acceso a él.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Ir al inicio
      </Link>
    </main>
  );
}
