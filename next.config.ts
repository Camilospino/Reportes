import path from "node:path";
import type { NextConfig } from "next";

const secure = (process.env.APP_URL ?? "").startsWith("https://");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  // La cámara se usa a través de <input type="file" capture>, que no requiere este permiso.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(secure ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // En Docker se compila con BUILD_STANDALONE=1 (imagen mínima). Localmente se usa `next start`.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // El entorno QA (scripts/qa.ts) compila en .next-qa para no pisar la compilación de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  // Solo desarrollo: permite abrir el servidor de desarrollo desde el celular (ej. DEV_ALLOWED_ORIGINS=192.168.1.10).
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS?.split(",").filter(Boolean),
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
