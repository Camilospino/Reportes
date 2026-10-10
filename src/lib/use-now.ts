import { useEffect, useState } from "react";

/**
 * Hora actual que se actualiza sola (cada minuto por defecto). Arranca con la hora del servidor
 * (`initial`) para que la primera pintura coincida con el HTML, y se corrige al montar.
 */
export function useNow(initial: number, intervalMs = 60_000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
