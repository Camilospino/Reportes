import { JetBrains_Mono, Manrope } from "next/font/google";

/** Fuentes del Panel. Se descargan al compilar y se sirven desde la app (CSP: font-src 'self'). */
export const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });
export const panelMono = JetBrains_Mono({ subsets: ["latin"], weight: ["600"] });
