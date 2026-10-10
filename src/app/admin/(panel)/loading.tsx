/** Esqueleto del Panel de prioridades: cabecera oscura y tres carriles. */
export default function Loading() {
  const pulse = "animate-pulse motion-reduce:animate-none";
  return (
    <div aria-busy="true" aria-label="Cargando el panel">
      <div className="-mx-4 -mt-5 bg-[#0F172A] lg:-mx-7">
        <div className="mx-auto max-w-[1300px] space-y-5 px-4 py-6 lg:px-7">
          <div className="flex flex-wrap gap-4">
            <div className={`h-14 w-72 rounded-lg bg-[#1E293B] ${pulse}`} />
            <div className={`ml-auto h-12 w-96 max-w-full rounded-xl bg-[#1E293B] ${pulse}`} />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={`h-[74px] rounded-xl bg-[#1E293B] ${pulse}`} />
              ))}
            </div>
            <div className={`h-[88px] rounded-xl bg-[#1E293B] ${pulse}`} />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1300px] gap-6 px-4 pt-5 lg:grid-cols-3 lg:gap-[18px] lg:px-7 lg:pt-6">
        {[0, 1, 2].map((lane) => (
          <div key={lane} className="space-y-3">
            <div className={`h-[66px] rounded-[14px] bg-white ${pulse}`} />
            {[0, 1].map((i) => (
              <div key={i} className={`h-[170px] rounded-2xl border border-[#E2E8F0] bg-white ${pulse}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
