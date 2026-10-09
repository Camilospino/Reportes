/** Esqueleto del inicio del técnico mientras llegan los datos. */
export default function Loading() {
  return (
    <div className="-mx-4 -mt-5 md:mt-0" aria-busy="true" aria-label="Cargando reportes">
      <div className="h-[150px] rounded-b-[28px] bg-[#2563EB] md:rounded-t-[28px]" />
      <div className="space-y-4 px-4">
        <div className="-mt-10 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[78px] animate-pulse rounded-2xl bg-[#E2E8F0] shadow-[0_8px_20px_rgba(15,23,42,.08)] motion-reduce:animate-none" />
          ))}
        </div>
        <div className="h-[50px] animate-pulse rounded-[14px] bg-[#E2E8F0] motion-reduce:animate-none" />
        {[0, 1].map((i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-[18px] bg-[#E2E8F0] motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
