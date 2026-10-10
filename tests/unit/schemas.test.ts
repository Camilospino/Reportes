import { describe, expect, it } from "vitest";
import {
  adminDecisionSchema,
  deadlineConfigSchema,
  fieldErrors,
  outcomeSchema,
  panelDecisionSchema,
  passwordSchema,
  phoneSchema,
  reportInputSchema,
} from "@/domain/schemas";
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
    expect(fieldErrors(r.error!).category).toBeDefined();
  });

  const common = {
    street: "Calle 5 # 3-40",
    neighborhood: "Manga",
    priority: "MEDIA",
    clientName: "Ana",
    clientPhone: "3001234567",
    contractNumber: "CTG-1",
  };

  it("sin tipo se asume Daño (reportes y formularios de antes)", () => {
    const r = reportInputSchema.safeParse({ ...common, category: "WIFI", description: "Sin señal" });
    expect(r.success && r.data.type).toBe("DANO");
  });

  it("instalación: plan y al menos un equipo; el serial es opcional al crear", () => {
    const ok = reportInputSchema.safeParse({ ...common, type: "INSTALACION", plan: "300 Mbps", equipment: [{ kind: "ONU" }] });
    expect(ok.success).toBe(true);
    const noPlan = reportInputSchema.safeParse({ ...common, type: "INSTALACION", equipment: [{ kind: "ONU" }] });
    expect(noPlan.success).toBe(false);
    const noEquipment = reportInputSchema.safeParse({ ...common, type: "INSTALACION", plan: "300 Mbps", equipment: [] });
    expect(noEquipment.success).toBe(false);
    expect(fieldErrors(noEquipment.error!).equipment?.[0]).toBe("Agregue al menos un equipo.");
    const past = reportInputSchema.safeParse({ ...common, type: "INSTALACION", plan: "1", equipment: [{ kind: "ONU" }], suggestedDate: "2020-01-01" });
    expect(past.success).toBe(false);
  });

  it("retiro: motivo obligatorio y texto cuando es Otro", () => {
    const base = { ...common, type: "RETIRO", equipment: [{ kind: "Router", serial: "ABC" }] };
    expect(reportInputSchema.safeParse({ ...base, withdrawalReason: "MORA" }).success).toBe(true);
    expect(reportInputSchema.safeParse(base).success).toBe(false);
    const otro = reportInputSchema.safeParse({ ...base, withdrawalReason: "OTRO" });
    expect(otro.success).toBe(false);
    expect(fieldErrors(otro.error!).withdrawalReasonOther).toBeDefined();
    expect(reportInputSchema.safeParse({ ...base, withdrawalReason: "OTRO", withdrawalReasonOther: "Mudanza" }).success).toBe(true);
  });

  it("REALIZADO acepta el cierre de equipos (las reglas por tipo se validan en el servidor)", () => {
    const photo = "33333333-3333-4333-8333-333333333333";
    const equipment = [{ id: "44444444-4444-4444-8444-444444444444", received: false, observation: "  " }];
    const r = outcomeSchema.safeParse({ transition: "REALIZADO", ...ids, attachmentIds: [photo], equipment });
    expect(r.success).toBe(true);
    expect(r.success && r.data.transition === "REALIZADO" && r.data.equipment[0]?.observation).toBeUndefined();
    expect(outcomeSchema.safeParse({ transition: "REALIZADO", ...ids, attachmentIds: [photo], equipment: [{ id: "x" }] }).success).toBe(false);
  });

  it("ajustes de plazos: horas enteras y el aviso antes del vencimiento", () => {
    const rows = (d: number, w: number) => (["DANO", "INSTALACION", "RETIRO"] as const).map((type) => ({ type, deadlineHours: d, warnFromHours: w }));
    expect(deadlineConfigSchema.safeParse(rows(72, 24)).success).toBe(true);
    expect(deadlineConfigSchema.safeParse(rows(72, 72)).success).toBe(false);
    expect(deadlineConfigSchema.safeParse(rows(0, 0)).success).toBe(false);
    expect(deadlineConfigSchema.safeParse(rows(800, 24)).success).toBe(false);
    expect(deadlineConfigSchema.safeParse(rows(72, 24).slice(0, 2)).success).toBe(false);
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

