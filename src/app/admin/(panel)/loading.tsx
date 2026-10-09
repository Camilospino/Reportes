/** Esqueleto del Panel: franja de estados, lista y detalle. */
export default function Loading() {
  const pulse = "animate-pulse bg-[#E2E8F0] motion-reduce:animate-none";
  return (
    <div className="lg:flex lg:h-[calc(100dvh-132px)] lg:min-h-[640px] lg:flex-col lg:gap-4" aria-busy="true" aria-label="Cargando el panel">
      <div className="flex items-center gap-4">
        <div className={`h-8 w-32 rounded-lg ${pulse}`} />
        <div className={`ml-auto hidden h-11 w-80 rounded-xl sm:block ${pulse}`} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-[10px] lg:mt-0 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`h-[78px] rounded-[14px] ${pulse}`} />
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#E2E8F0] bg-white lg:mt-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[420px_1fr]">
        <div className="space-y-3 p-5 lg:border-r lg:border-[#E2E8F0]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`h-12 rounded-lg ${pulse}`} />
          ))}
        </div>
        <div className="hidden space-y-4 p-8 lg:block">
          <div className={`h-5 w-48 rounded ${pulse}`} />
          <div className={`h-9 w-2/3 rounded-lg ${pulse}`} />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-16 rounded-xl ${pulse}`} />
            ))}
          </div>
          <div className={`h-40 rounded-xl ${pulse}`} />
        </div>
      </div>
    </div>
  );
}
