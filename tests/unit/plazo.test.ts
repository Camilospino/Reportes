import { describe, expect, it } from "vitest";
import { calcularPlazo, cortesPlazo, plazoDeOrden, type PlazoOrden } from "@/lib/plazo";

const HOUR = 3_600_000;
const ahora = new Date("2026-10-10T17:00:00Z");
const config = { avisoDesdeHoras: 24 };

/** Orden creada hace `h` horas con plazo de `plazo` horas. */
function orden(h: number, extra: Partial<PlazoOrden> = {}, plazo = 72): PlazoOrden {
  const createdAt = new Date(ahora.getTime() - h * HOUR);
  return { status: "PENDIENTE", createdAt, dueAt: new Date(createdAt.getTime() + plazo * HOUR), ...extra };
}

describe("calcularPlazo: niveles con la configuración por defecto (24 / 48 / 72 h)", () => {
  it("A tiempo: menos de 24 h", () => {
    const p = calcularPlazo(orden(20), config, ahora);
    expect(p.nivel).toBe("a-tiempo");
    expect(p.horasTranscurridas).toBeCloseTo(20);
    expect(p.horasRestantes).toBeCloseTo(52);
    expect(p.texto).toBe("Vence en 52 h");
  });

  it("Atención: desde las 24 h", () => {
    expect(calcularPlazo(orden(23.99), config, ahora).nivel).toBe("a-tiempo");
    const p = calcularPlazo(orden(24), config, ahora);
    expect(p.nivel).toBe("atencion");
    expect(calcularPlazo(orden(32), config, ahora).texto).toBe("Vence en 40 h");
  });

  it("Por vencer: desde las 48 h (2/3 del plazo)", () => {
    expect(calcularPlazo(orden(47.9), config, ahora).nivel).toBe("atencion");
    const p = calcularPlazo(orden(63), config, ahora);
    expect(p.nivel).toBe("por-vencer");
    expect(p.texto).toBe("Vence en 9 h");
  });

  it("Vencido: al cumplir las 72 h", () => {
    expect(calcularPlazo(orden(71.99), config, ahora).nivel).toBe("por-vencer");
    expect(calcularPlazo(orden(71.99), config, ahora).texto).toBe("Vence en menos de 1 h");
    expect(calcularPlazo(orden(72), config, ahora).nivel).toBe("vencido");
    expect(calcularPlazo(orden(72.5), config, ahora).texto).toBe("Vencido hace menos de 1 h");
    const p = calcularPlazo(orden(77), config, ahora);
    expect(p.texto).toBe("Vencido hace 5 h");
    expect(p.horasRestantes).toBeCloseTo(-5);
  });

  it("el reloj corre también en Aplazado y Cliente ausente", () => {
    expect(calcularPlazo(orden(50, { status: "APLAZADO" }), config, ahora).nivel).toBe("por-vencer");
    expect(calcularPlazo(orden(80, { status: "CLIENTE_AUSENTE" }), config, ahora).nivel).toBe("vencido");
    expect(calcularPlazo(orden(30, { status: "EN_PROCESO" }), config, ahora).nivel).toBe("atencion");
  });
});

describe("calcularPlazo: reloj detenido y estados sin plazo", () => {
  it("Realizado detiene el reloj en completedAt (no sigue contando)", () => {
    const o = orden(100, { status: "REALIZADO", completedAt: new Date(ahora.getTime() - 60 * HOUR) }); // a las 40 h
    const p = calcularPlazo(o, config, ahora);
    expect(p.nivel).toBe("detenido");
    expect(p.horasTranscurridas).toBeCloseTo(40);
    expect(p.texto).toBe("Cumplió el plazo");
    // Una hora después, igual.
    expect(calcularPlazo(o, config, new Date(ahora.getTime() + HOUR)).horasTranscurridas).toBeCloseTo(40);
  });

  it("Realizado tarde: dice por cuántas horas", () => {
    const o = orden(100, { status: "REALIZADO", completedAt: new Date(ahora.getTime() - 22 * HOUR) }); // a las 78 h
    expect(calcularPlazo(o, config, ahora).texto).toBe("Fuera de plazo por 6 h");
  });

  it("devolver: vuelve a Pendiente con el MISMO dueAt y el reloj sigue donde iba", () => {
    const realizada = orden(50, { status: "REALIZADO", completedAt: new Date(ahora.getTime() - 10 * HOUR) });
    const devuelta: PlazoOrden = { ...realizada, status: "PENDIENTE", completedAt: null };
    const p = calcularPlazo(devuelta, config, ahora);
    expect(p.horasTranscurridas).toBeCloseTo(50); // desde la creación, no desde la devolución
    expect(p.nivel).toBe("por-vencer");
    expect(p.texto).toBe("Vence en 22 h");
  });

  it("Verificado y Cancelado no tienen plazo activo", () => {
    for (const status of ["VERIFICADO", "CANCELADO"] as const) {
      const p = calcularPlazo(orden(500, { status }), config, ahora);
      expect(p.nivel).toBe("sin-plazo");
      expect(p.texto).toBe("");
    }
  });
});

describe("cortes configurables", () => {
  it("Atención desde avisoDesdeHoras, Por vencer a los 2/3 y Vencido al cumplir el plazo", () => {
    expect(cortesPlazo(48, { avisoDesdeHoras: 12 })).toEqual({ atencion: 12, porVencer: 32, vencido: 48 });
    const o = orden(13, {}, 48);
    expect(calcularPlazo(o, { avisoDesdeHoras: 12 }, ahora).nivel).toBe("atencion");
    expect(calcularPlazo(orden(33, {}, 48), { avisoDesdeHoras: 12 }, ahora).nivel).toBe("por-vencer");
    expect(calcularPlazo(orden(48, {}, 48), { avisoDesdeHoras: 12 }, ahora).nivel).toBe("vencido");
  });

  it("plazoDeOrden usa el aviso guardado en la orden (los cambios de Ajustes no afectan a las viejas)", () => {
    expect(plazoDeOrden({ ...orden(30), warnFromHours: 36 }, ahora).nivel).toBe("a-tiempo");
    expect(plazoDeOrden({ ...orden(30), warnFromHours: 24 }, ahora).nivel).toBe("atencion");
  });
});
