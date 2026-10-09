import { describe, expect, it } from "vitest";
import { $Enums } from "@prisma/client";
import { ATTACHMENT_KINDS, CATEGORIES, PRIORITIES, REPORT_STATUSES, ROLES } from "@/domain/types";
import { normalizeForSearch } from "@/domain/text";
import { bogotaDateString, bogotaDayStart, parseBogotaDateTimeLocal } from "@/lib/dates";
import { check, consume, hit } from "@/server/rate-limit";
import { generateTempPassword, hashPassword, verifyPassword } from "@/server/password";

describe("enums del dominio = enums de Prisma", () => {
  it("coinciden en valores y orden", () => {
    expect([...REPORT_STATUSES]).toEqual(Object.values($Enums.ReportStatus));
    expect([...ROLES]).toEqual(Object.values($Enums.Role));
    expect([...CATEGORIES]).toEqual(Object.values($Enums.DamageCategory));
    expect([...PRIORITIES]).toEqual(Object.values($Enums.Priority));
    expect([...ATTACHMENT_KINDS]).toEqual(Object.values($Enums.AttachmentKind));
  });
});

describe("búsqueda", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(normalizeForSearch("  Calle  Ñandú, BOGOTÁ ")).toBe("calle nandu, bogota");
  });
});

describe("fechas en hora de Colombia", () => {
  it("interpreta las entradas como UTC-5", () => {
    expect(parseBogotaDateTimeLocal("2026-10-08T14:30").toISOString()).toBe("2026-10-08T19:30:00.000Z");
    expect(bogotaDayStart("2026-10-08").toISOString()).toBe("2026-10-08T05:00:00.000Z");
    // 02:00 UTC del 9 = 21:00 del 8 en Bogotá
    expect(bogotaDateString(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
  });
});

describe("límite de intentos", () => {
  it("check/hit: solo los intentos registrados (fallidos) cuentan", () => {
    const key = `test-${Math.random()}`;
    const now = 5_000_000;
    for (let i = 0; i < 100; i++) expect(check(key, 5, now).allowed).toBe(true); // consultar no cuenta
    for (let i = 0; i < 5; i++) hit(key, 60_000, now);
    expect(check(key, 5, now).allowed).toBe(false);
    expect(check(key, 5, now + 60_001).allowed).toBe(true);
  });

  it("bloquea al superar el límite y se reinicia con la ventana", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(consume(key, 5, 60_000, now).allowed).toBe(true);
    expect(consume(key, 5, 60_000, now).allowed).toBe(false);
    expect(consume(key, 5, 60_000, now + 60_001).allowed).toBe(true);
  });
});

describe("contraseñas", () => {
  it("argon2id: verifica la correcta y rechaza la incorrecta", async () => {
    const h = await hashPassword("Segura2026");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Segura2026")).toBe(true);
    expect(await verifyPassword(h, "otra")).toBe(false);
  });

  it("contraseña temporal: 10 caracteres, letras y dígitos, sin ambiguos", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});
