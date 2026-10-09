import Link from "next/link";

/** Paginación con enlaces (funciona sin JavaScript y conserva los filtros de la URL). */
export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Paginación">
      {page > 1 ? (
        <Link className="btn btn-secondary" href={href(page - 1)}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-600">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link className="btn btn-secondary" href={href(page + 1)}>
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
