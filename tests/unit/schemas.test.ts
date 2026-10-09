import { describe, expect, it } from "vitest";
import { adminDecisionSchema, outcomeSchema, panelDecisionSchema, passwordSchema, phoneSchema, reportInputSchema } from "@/domain/schemas";
import { bogotaDateTimeLocal } from "@/lib/dates";

const ids = { reportId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222" };
const photo = "33333333-3333-4333-8333-333333333333";

describe("resultado de la visita", () => {
  it("REALIZADO sin foto es rechazado", () => {
    const r = outcomeSchema.safeParse({ transition: "REALIZADO", ...ids, attachmentIds: [] });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.attachmentIds?.[0]).toMatch(/al menos una foto/);
  });

  it("REALIZADO con foto y nota opcional es válido", () => {
    expect(outcomeSchema.safeParse({ transition: "REALIZADO", ...ids, attachmentIds: [photo] }).success).toBe(true);
    expect(outcomeSchema.safeParse({ transition: "REALIZADO", ...ids, attachmentIds: [photo], note: "ok" }).success).toBe(true);
  });

  it("APLAZADO exige motivo; la fecha es opcional y no puede ser pasada", () => {
    expect(outcomeSchema.safeParse({ transition: "APLAZADO", ...ids, reason: "  " }).success).toBe(false);
    expect(outcomeSchema.safeParse({ transition: "APLAZADO", ...ids, reason: "Falta material" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ transition: "APLAZADO", ...ids, reason: "x", newDate: "2020-01-01" }).success).toBe(false);
  });

  it("CLIENTE_AUSENTE exige fecha/hora no futura; la foto es opcional", () => {
    expect(outcomeSchema.safeParse({ transition: "CLIENTE_AUSENTE", ...ids }).success).toBe(false);
    expect(outcomeSchema.safeParse({ transition: "CLIENTE_AUSENTE", ...ids, attemptedAt: bogotaDateTimeLocal() }).success).toBe(true);
    const future = bogotaDateTimeLocal(new Date(Date.now() + 3 * 3600_000));
    expect(outcomeSchema.safeParse({ transition: "CLIENTE_AUSENTE", ...ids, attemptedAt: future }).success).toBe(false);
  });
});

describe("decisiones del administrador", () => {
  it("rechazar/reprogramar/cancelar exigen comentario; verificar no", () => {
    expect(adminDecisionSchema.safeParse({ transition: "VERIFICAR", ...ids }).success).toBe(true);
    for (const t of ["RECHAZAR", "REPROGRAMAR", "CANCELAR"]) {
      expect(adminDecisionSchema.safeParse({ transition: t, ...ids }).success).toBe(false);
      expect(adminDecisionSchema.safeParse({ transition: t, ...ids, comment: "Falta foto del tablero" }).success).toBe(true);
    }
  });
});

describe("validación de entradas", () => {
  it("teléfonos colombianos", () => {
    expect(phoneSchema.parse("300 123 4567")).toBe("3001234567");
    expect(phoneSchema.parse("+57 (300) 123-4567")).toBe("+573001234567");
    expect(phoneSchema.safeParse("abc").success).toBe(false);
  });

  it("reporte: recorta espacios y exige campos obligatorios", () => {
    const r = reportInputSchema.safeParse({
      street: "  Calle 1  ",
      neighborhood: "Centro",
      city: "Bogotá",
      category: "SIN_SERVICIO",
      description: "x",
      priority: "ALTA",
      clientName: "Ana",
      clientPhone: "3001234567",
      contractNumber: " ctg-004512 ",
      assignedToId: "",
    });
    expect(r.success).toBe(true);
    expect(r.data?.street).toBe("Calle 1");
    // Solo se opera en Cartagena: la ciudad enviada se ignora.
    expect(r.data?.city).toBe("Cartagena de Indias, Bolívar");
    expect(r.data?.assignedToId).toBeNull();
    expect(r.data?.contractNumber).toBe("CTG-004512");
    expect(reportInputSchema.safeParse({ street: "" }).success).toBe(false);
  });

  it("categoría inválida es rechazada (no se confía en el <select>)", () => {
    const r = reportInputSchema.safeParse({ category: "'; DROP TABLE reports;--" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.category).toBeDefined();
  });

  it("contraseñas: mínimo 8, letras y números", () => {
    expect(passwordSchema.safeParse("corta1").success).toBe(false);
    expect(passwordSchema.safeParse("soloLetras").success).toBe(false);
    expect(passwordSchema.safeParse("Segura2026").success).toBe(true);
  });
});

describe("panelDecisionSchema (bandeja del Panel)", () => {
  const base = { id: ids.reportId, requestId: ids.requestId };
  it("la nota es opcional, se recorta y vacía cuenta como sin nota", () => {
    expect(panelDecisionSchema.parse(base).nota).toBeUndefined();
    expect(panelDecisionSchema.parse({ ...base, nota: "   " }).nota).toBeUndefined();
    expect(panelDecisionSchema.parse({ ...base, nota: "  Volver mañana  " }).nota).toBe("Volver mañana");
  });
  it("máximo 500 caracteres e id obligatorio", () => {
    expect(panelDecisionSchema.safeParse({ ...base, nota: "x".repeat(500) }).success).toBe(true);
    expect(panelDecisionSchema.safeParse({ ...base, nota: "x".repeat(501) }).success).toBe(false);
    expect(panelDecisionSchema.safeParse({ requestId: ids.requestId }).success).toBe(false);
  });
});

