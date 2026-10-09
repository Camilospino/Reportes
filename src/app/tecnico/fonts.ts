import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/** Fuentes de la pantalla de inicio del técnico. Se descargan al compilar (la CSP solo permite 'self'). */
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"] });
