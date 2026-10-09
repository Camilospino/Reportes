import { describe, expect, it } from "vitest";
import { REPORT_TEMPLATES, TEMPLATE_BLANK } from "@/domain/report-templates";
import { CATEGORIES, PRIORITIES } from "@/domain/types";

describe("plantillas de nuevo reporte", () => {
  it("usan categorías y prioridades reales de la app", () => {
    for (const t of REPORT_TEMPLATES) {
      if (!t.fill) continue;
      expect(CATEGORIES).toContain(t.fill.category);
      expect(PRIORITIES).toContain(t.fill.priority);
    }
  });

  it("dejan espacios por completar y no repiten id", () => {
    for (const t of REPORT_TEMPLATES) if (t.fill) expect(t.fill.description).toContain(TEMPLATE_BLANK);
    expect(new Set(REPORT_TEMPLATES.map((t) => t.id)).size).toBe(REPORT_TEMPLATES.length);
  });

  it("hay una plantilla en blanco que no llena nada", () => {
    expect(REPORT_TEMPLATES.filter((t) => t.fill === null)).toHaveLength(1);
  });
});
