"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Eye, EyeOff, Hand, LoaderCircle, UserRound } from "lucide-react";
import { loginAction } from "../actions";

/** Tiempo que se muestra el reverso "Acceso válido" antes de navegar (volteo de 1 s + 1,2 s). */
const FLIP_MS = 1000;
const SHOW_BACK_MS = 1200;
const TILT_DEG = 16;

function initials(username: string): string {
  return username.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase();
}

/**
 * Login con forma de carnet que cuelga de una cinta: se inclina siguiendo el mouse y, si el
 * acceso es válido, se voltea antes de ir al panel. La autenticación es la misma de siempre
 * (loginAction); aquí solo cambia la presentación.
 */
export function LoginForm({ loggedInHome }: { loggedInHome: string | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(loginAction, null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emptyFields, setEmptyFields] = useState<{ username: boolean; password: boolean } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const canTilt = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setReducedMotion(reduce.matches);
      canTilt.current = !reduce.matches && !coarse.matches;
    };
    update();
    reduce.addEventListener("change", update);
    coarse.addEventListener("change", update);
    return () => {
      reduce.removeEventListener("change", update);
      coarse.removeEventListener("change", update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  // Quien abre /login con sesión vigente va directo a su panel (sin animación).
  const alreadyIn = loggedInHome !== null && state === null;
  useEffect(() => {
    if (alreadyIn) router.replace(loggedInHome);
  }, [alreadyIn, loggedInHome, router]);

  // Acceso válido: voltear, mostrar el reverso y navegar a la misma ruta de siempre.
  const target = state?.ok ? state.data.target : null;
  useEffect(() => {
    if (!target) return;
    setFlipped(true);
    resetTilt();
    const t = setTimeout(() => router.replace(target), (reducedMotion ? 0 : FLIP_MS) + SHOW_BACK_MS);
    return () => clearTimeout(t);
  }, [target]);

  /** Inclinación y brillo por variables CSS dentro de requestAnimationFrame: no re-renderiza React. */
  function setTilt(x: number, y: number) {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = tiltRef.current;
      if (!el) return;
      el.style.setProperty("--rx", `${(0.5 - y) * TILT_DEG}deg`);
      el.style.setProperty("--ry", `${(x - 0.5) * TILT_DEG}deg`);
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
    });
  }
  function resetTilt() {
    setTilt(0.5, 0.5);
  }
  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!canTilt.current || flipped) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const missing = { username: !username.trim(), password: !password };
    if (missing.username || missing.password) {
      e.preventDefault(); // no se llama al servidor
      setEmptyFields(missing);
      return;
    }
    setEmptyFields(null);
  }

  const serverError = state && !state.ok ? state : null;
  const usernameError = emptyFields?.username || Boolean(serverError?.fieldErrors?.username?.length);
  const passwordError = emptyFields?.password || Boolean(serverError?.fieldErrors?.password?.length);
  const message = emptyFields ? "Escriba su usuario y su contraseña." : (serverError?.error ?? null);
  const busy = pending || flipped;
  const letters = initials(username);
  if (alreadyIn) return null;

  const input =
    "h-[50px] w-full rounded-xl border-2 px-4 text-base text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,.18)]";
  const inputState = (error: boolean) => (error ? "border-[#DC2626] bg-[#FEF2F2]" : "border-[#E2E8F0] bg-[#F8FAFC]");

  return (
    <>
      {/* Cinta y broche */}
      <div className="flex gap-10" aria-hidden>
        <span className="h-[110px] w-6 skew-x-[8deg] bg-[#2563EB]" />
        <span className="h-[110px] w-6 -skew-x-[8deg] bg-[#2563EB]" />
      </div>
      <div className="relative z-10 -mt-2 h-[26px] w-[72px] rounded-lg border-[3px] border-[#64748B] bg-[#94A3B8]" aria-hidden />

      {/* Carnet */}
      <div className="-mt-2 w-full max-w-[400px] [perspective:1400px]" onMouseMove={onMouseMove} onMouseLeave={resetTilt}>
        <div
          ref={tiltRef}
          className="[transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-transform duration-[180ms] ease-out [transform-style:preserve-3d] motion-reduce:[transform:none]"
        >
          <div
            className={`relative h-[620px] [transform-style:preserve-3d] ${
              reducedMotion ? "" : "transition-transform duration-1000 ease-[cubic-bezier(.3,1.35,.5,1)]"
            } ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
          >
            {/* Cara frontal */}
            <section
              aria-hidden={flipped}
              inert={flipped}
              className={`absolute inset-0 overflow-hidden rounded-[26px] bg-white shadow-[0_40px_80px_rgba(2,6,23,.55)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] ${
                reducedMotion && flipped ? "invisible" : ""
              }`}
            >
              <header className="relative bg-[#2563EB] px-7 pt-[26px] pb-[54px] text-center text-white">
                <div className="mx-auto mb-4 h-2.5 w-[60px] rounded-full bg-[#1E40AF]" aria-hidden />
                <h1 className="text-lg font-bold tracking-[1.5px] uppercase">Reportes de daños</h1>
                {/* #EFF6FF en vez de #BFDBFE: este último no llega a 4.5:1 sobre el azul. */}
                <p className="text-[13px] tracking-[2px] text-[#EFF6FF] uppercase">Carnet de acceso</p>
                <div
                  className="absolute bottom-[-44px] left-1/2 flex size-[88px] -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-white bg-[#DBEAFE] text-[30px] font-extrabold text-[#1E3A8A]"
                  aria-hidden
                >
                  {letters || <UserRound size={40} strokeWidth={2} />}
                </div>
              </header>

              <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5 px-7 pt-[58px] pb-7">
                <p className="truncate text-center text-[22px] font-bold text-[#0F172A]" aria-hidden>
                  {username.trim() || "Su usuario"}
                </p>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="username" className="text-sm font-semibold text-[#334155]">
                    Usuario
                  </label>
                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Ej. amartinez"
                    aria-invalid={usernameError}
                    aria-describedby={message ? "login-error" : undefined}
                    className={`${input} ${inputState(usernameError)}`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-semibold text-[#334155]">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      aria-invalid={passwordError}
                      aria-describedby={message ? "login-error" : undefined}
                      className={`${input} pr-14 ${inputState(passwordError)}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute top-[3px] right-1 flex size-11 items-center justify-center rounded-[10px] text-[#475569] hover:text-[#0F172A]"
                    >
                      {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                    </button>
                  </div>
                </div>

                {message ? (
                  <p id="login-error" role="alert" className="text-[13px] font-medium text-[#B91C1C]">
                    {message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-[54px] items-center justify-center gap-2 rounded-[14px] bg-[#2563EB] text-[17px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-[.98] disabled:cursor-wait disabled:bg-[#1D4ED8]"
                >
                  {pending ? (
                    <>
                      <LoaderCircle size={20} className="animate-spin" aria-hidden />
                      Validando…
                    </>
                  ) : (
                    "Ingresar"
                  )}
                </button>

                <p className="text-center text-[13px] text-[#64748B]">
                  ¿Olvidó su contraseña? Pídale al administrador que la restablezca.
                </p>
              </form>

              {/* Brillo que sigue al mouse */}
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--gx,50%)_var(--gy,50%),rgba(255,255,255,.35),transparent_45%)] motion-reduce:hidden"
                aria-hidden
              />
            </section>

            {/* Cara trasera */}
            <section
              aria-hidden={!flipped}
              aria-live="polite"
              className={`absolute inset-0 flex flex-col items-center justify-center gap-[18px] overflow-hidden rounded-[26px] bg-[#0F172A] px-7 text-white shadow-[0_40px_80px_rgba(2,6,23,.55)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] ${
                reducedMotion ? (flipped ? "" : "invisible") : "[transform:rotateY(180deg)]"
              }`}
            >
              {flipped ? (
                <>
                  <span className="flex items-center gap-2 rounded-full bg-[#22C55E] px-4 py-2 text-[15px] font-extrabold text-[#052E16] uppercase">
                    <CircleCheck size={18} strokeWidth={2.5} aria-hidden />
                    Acceso válido
                  </span>
                  <p className="max-w-full truncate text-[26px] font-extrabold">{username.trim()}</p>
                  <FakeCode seed={username.trim().toLowerCase()} />
                  <p className="text-[#94A3B8]">Abriendo su panel…</p>
                </>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <p className="mt-6 flex items-center gap-2 text-sm text-[#94A3B8] pointer-coarse:hidden motion-reduce:hidden">
        <Hand size={18} aria-hidden />
        Mueva el mouse sobre el carnet
      </p>
    </>
  );
}

const GRID = 11;

const FINDERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, GRID - 3],
  [GRID - 3, 0],
];

/** Tres "ojos" fijos tipo QR en las esquinas (3×3 encendidos, con un borde apagado). null = celda libre. */
function finder(r: number, c: number): boolean | null {
  for (const [r0, c0] of FINDERS) {
    if (r >= r0 && r < r0 + 3 && c >= c0 && c < c0 + 3) return true;
    if (r >= r0 - 1 && r <= r0 + 3 && c >= c0 - 1 && c <= c0 + 3) return false;
  }
  return null;
}

/**
 * Código decorativo con aspecto de QR. NO codifica datos: las celdas salen de un hash del usuario
 * (FNV-1a + xorshift), así que el mismo usuario siempre ve el mismo dibujo.
 */
function FakeCode({ seed }: { seed: string }) {
  let h = 0x811c9dc5;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 0xffffffff;
  };
  const cells: boolean[] = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) cells.push(finder(r, c) ?? next() > 0.5);
  return (
    <div className="grid size-[198px] grid-cols-11 gap-0.5 rounded-2xl bg-white p-3" aria-hidden>
      {cells.map((on, i) => (
        <span key={i} className={on ? "rounded-[2px] bg-[#0F172A]" : ""} />
      ))}
    </div>
  );
}
