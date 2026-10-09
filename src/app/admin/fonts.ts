import { Inter_Tight, JetBrains_Mono } from "next/font/google";

/** Fuentes del Panel. Se descargan al compilar y se sirven desde la app (CSP: font-src 'self'). */
export const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
export const panelMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"] });
