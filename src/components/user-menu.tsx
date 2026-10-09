"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Key, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Avatar con menú desplegable: "Mi contraseña" y "Salir". Se cierra al hacer clic afuera o con Escape. */
export function UserMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold";

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Menú de ${userName}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[52px] items-center gap-2 rounded-full border border-[#E2E8F0] bg-white p-[6px] hover:bg-[#F8FAFC] min-[900px]:pr-3"
      >
        <span className="flex size-[38px] items-center justify-center rounded-full bg-[#F97316] text-sm font-extrabold text-white">
          {initials(userName)}
        </span>
        <span className="hidden max-w-40 truncate text-[15px] font-semibold text-[#0F172A] min-[900px]:inline">{userName}</span>
        <ChevronDown size={18} strokeWidth={2} className="hidden text-[#475569] min-[900px]:block" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute top-[calc(100%+18px)] right-0 w-[230px] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
        >
          <Link href="/cambiar-clave" onClick={() => setOpen(false)} className={`${item} text-[#0F172A] hover:bg-[#EFF6FF]`}>
            <Key size={18} strokeWidth={2} aria-hidden />
            Mi contraseña
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={`${item} text-[#B91C1C] hover:bg-[#FEF2F2]`}>
              <LogOut size={18} strokeWidth={2} aria-hidden />
              Salir
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
