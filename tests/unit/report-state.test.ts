import { describe, expect, it } from "vitest";
import { RULES, TRANSITIONS, availableTransitions, checkTransition, technicianCanSee } from "@/domain/report-state";
import { REPORT_STATUSES } from "@/domain/types";

const admin = { id: "admin", role: "ADMIN" as const };
const t1 = { id: "t1", role: "TECNICO" as const };
const t2 = { id: "t2", role: "TECNICO" as const };

describe("máquina de estados", () => {
  it("flujo feliz completo: tomar → realizado → verificar", () => {
    expect(checkTransition("TOMAR", { status: "PENDIENTE", assignedToId: null }, t1)).toEqual({ ok: true, to: "EN_PROCESO" });
    expect(checkTransition("REALIZADO", { status: "EN_PROCESO", assignedToId: "t1" }, t1)).toEqual({ ok: true, to: "REALIZADO" });
    expect(checkTransition("VERIFICAR", { status: "REALIZADO", assignedToId: "t1" }, admin)).toEqual({ ok: true, to: "VERIFICADO" });
  });

  it("rechazar devuelve a PENDIENTE", () => {
    expect(checkTransition("RECHAZAR", { status: "REALIZADO", assignedToId: "t1" }, admin)).toEqual({ ok: true, to: "PENDIENTE" });
  });

  it("aplazado y cliente ausente se reprograman (no se verifican)", () => {
    for (const status of ["APLAZADO", "CLIENTE_AUSENTE"] as const) {
      expect(checkTransition("REPROGRAMAR", { status, assignedToId: "t1" }, admin).ok).toBe(true);
      expect(checkTransition("VERIFICAR", { status, assignedToId: "t1" }, admin).ok).toBe(false);
    }
  });

  it("un técnico NUNCA puede ejecutar transiciones de administrador", () => {
    for (const t of TRANSITIONS.filter((x) => RULES[x].role === "ADMIN")) {
      for (const status of REPORT_STATUSES) {
        expect(checkTransition(t, { status, assignedToId: "t1" }, t1).ok).toBe(false);
      }
    }
  });

  it("un administrador no puede ejecutar transiciones de técnico", () => {
    for (const t of TRANSITIONS.filter((x) => RULES[x].role === "TECNICO")) {
      for (const status of REPORT_STATUSES) {
        expect(checkTransition(t, { status, assignedToId: "admin" }, admin).ok).toBe(false);
      }
    }
  });

  it("un técnico no puede cerrar el reporte de otro técnico", () => {
    for (const t of ["REALIZADO", "APLAZADO", "CLIENTE_AUSENTE", "LIBERAR"] as const) {
      expect(checkTransition(t, { status: "EN_PROCESO", assignedToId: "t1" }, t2).ok).toBe(false);
    }
  });

  it("un técnico no puede tomar un reporte asignado a otro", () => {
    expect(checkTransition("TOMAR", { status: "PENDIENTE", assignedToId: "t1" }, t2).ok).toBe(false);
    expect(checkTransition("TOMAR", { status: "PENDIENTE", assignedToId: "t1" }, t1).ok).toBe(true);
  });

  it("estados finales no tienen transiciones", () => {
    for (const status of ["VERIFICADO", "CANCELADO"] as const) {
      expect(availableTransitions({ status, assignedToId: "t1" }, admin)).toEqual([]);
      expect(availableTransitions({ status, assignedToId: "t1" }, t1)).toEqual([]);
    }
  });

  it("no se puede marcar realizado sin haber tomado el reporte", () => {
    expect(checkTransition("REALIZADO", { status: "PENDIENTE", assignedToId: "t1" }, t1).ok).toBe(false);
  });

  it("visibilidad del técnico", () => {
    expect(technicianCanSee({ status: "PENDIENTE", assignedToId: null }, "t1")).toBe(true);
    expect(technicianCanSee({ status: "PENDIENTE", assignedToId: "t2" }, "t1")).toBe(false);
    expect(technicianCanSee({ status: "EN_PROCESO", assignedToId: "t1" }, "t1")).toBe(true);
    expect(technicianCanSee({ status: "EN_PROCESO", assignedToId: "t2" }, "t1")).toBe(false);
  });
});
