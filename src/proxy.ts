import { NextResponse, type NextRequest } from "next/server";

/**
 * Se ejecuta antes de cada página:
 * 1) Política de seguridad de contenido (CSP) con nonce por petición (mitiga XSS).
 * 2) Redirección rápida a /login si no hay cookie de sesión.
 *
 * OJO: esto es solo una comodidad. La autorización real (sesión válida + rol) se verifica
 * en cada página, Server Action y API con requireRole()/getApiUser() (src/server/session.ts).
 */
const SECURE = (process.env.APP_URL ?? "").startsWith("https://");
const COOKIE_NAME = (SECURE ? "__Host-sid" : "sid") + (process.env.SESSION_COOKIE_SUFFIX ?? "");
const PROTECTED = ["/admin", "/tecnico", "/cambiar-clave"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !request.cookies.has(COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // blob: lo usa el navegador para leer en el celular la foto recién tomada antes de comprimirla.
    "connect-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(SECURE ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Páginas solamente: excluye API, archivos estáticos y prefetch.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
