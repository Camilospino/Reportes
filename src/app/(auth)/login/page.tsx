import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { getCurrentUser, homeFor } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

// Solo para esta página. Se descarga al compilar y se sirve desde la app (CSP: font-src 'self').
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export default async function LoginPage() {
  // Con sesión ya iniciada se va a su panel. Lo hace LoginForm y no un redirect() aquí: al entrar,
  // Next vuelve a renderizar esta página y un redirect() cortaría la animación del carnet.
  const user = await getCurrentUser();
  return (
    <main className={`${outfit.className} flex min-h-dvh flex-col items-center overflow-x-hidden bg-[#0F172A] px-4 pb-12`}>
      <LoginForm loggedInHome={user ? homeFor(user.role) : null} />
    </main>
  );
}
