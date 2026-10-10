import { PrismaClient } from "@prisma/client";
import { expect, login, test } from "./helpers";
import { TEST_DATABASE_URL } from "./test-env";

/** Panel de prioridades: carriles, acciones y tiempo vivo, con los reportes de la semilla. */
test.describe.serial("Panel de prioridades", () => {
  const count = (page: import("@playwright/test").Page, label: string) =>
    page.getByRole("region", { name: "Órdenes por estado" }).locator("div", { hasText: label }).last().locator("p").last();

  test("celular: las vencidas van primero (más horas arriba); reprogramar la deja en Vencidas como Pendiente", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Panel de prioridades", level: 1 })).toBeVisible();
    const vencidas = page.getByRole("region", { name: "Vencidas" });
    const cards = vencidas.locator("article");
    // Semilla: Cliente ausente de 80 h y Aplazado de 72 h.
    await expect(cards.first()).toContainText("Avenida Pedro de Heredia # 23-45");
    await expect(vencidas.locator("article", { hasText: "Calle 70 # 40-20" })).toContainText(/Vencido hace/);

    const pendientes = Number(await count(page, "Pendiente").innerText());
    const aplazados = Number(await count(page, "Aplazado").innerText());
    const card = vencidas.locator("article", { hasText: "Calle 70 # 40-20" });
    await card.getByRole("button", { name: "Reprogramar" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} vuelve a Pendiente con Carlos Pérez \(el plazo sigue corriendo\)$/ })).toBeVisible();
    // El reloj no se reinicia: sigue en Vencidas, ahora Pendiente.
    await expect(card).toContainText("Pendiente · Carlos Pérez");
    await expect(count(page, "Pendiente")).toHaveText(String(pendientes + 1));
    await expect(count(page, "Aplazado")).toHaveText(String(aplazados - 1));
    await page.reload();
    await expect(page.getByRole("region", { name: "Vencidas" }).locator("article", { hasText: "Calle 70 # 40-20" })).toContainText("Pendiente · Carlos Pérez");
  });

  test("escritorio: cancelar pide confirmación en la misma tarjeta", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, "admin");
    await page.goto("/admin");
    const card = page.getByRole("region", { name: "Vencidas" }).locator("article", { hasText: "Avenida Pedro de Heredia # 23-45" });
    await card.getByRole("button", { name: "Cancelar" }).click();
    await expect(card.getByText(/^¿Cancelar R-\d{6}\?$/)).toBeVisible();
    await card.getByRole("button", { name: "No" }).click();
    await expect(card.getByRole("button", { name: "Reprogramar" })).toBeVisible();
    await card.getByRole("button", { name: "Cancelar" }).click();
    await card.getByRole("button", { name: "Sí" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} cancelado$/ })).toBeVisible();
    await expect(page.locator("article", { hasText: "Avenida Pedro de Heredia # 23-45" })).toHaveCount(0);
  });

  test("reasignar una pendiente con el menú de técnicos activos", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, "admin");
    await page.goto("/admin");
    const card = page.locator("article", { hasText: "Carrera 10 # 41-60" });
    await card.getByRole("button", { name: "Reasignar" }).click();
    await card.getByRole("button", { name: "Carlos Pérez" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} asignado a Carlos Pérez$/ })).toBeVisible();
    await expect(card).toContainText("Pendiente · Carlos Pérez");
    // Se deja como estaba (la usan otras pruebas).
    await card.getByRole("button", { name: "Reasignar" }).click();
    await card.getByRole("button", { name: "Laura Gómez" }).click();
    await expect(page.getByRole("status").filter({ hasText: /asignado a Laura Gómez$/ })).toBeVisible();
  });

  test("pestañas de tipo: filtran carriles y conteos, y quedan en la URL", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, "admin");
    await page.goto("/admin");
    await page.getByRole("tab", { name: /Instalaciones/ }).click();
    await expect(page).toHaveURL(/\/admin\?tipo=instalacion$/);
    await expect(page.getByRole("tab", { name: /Instalaciones/ })).toHaveAttribute("aria-selected", "true");
    // Semilla: una sola instalación, Pendiente y a tiempo (no entra en los carriles).
    await expect(count(page, "Todos")).toHaveText("1");
    await expect(count(page, "Pendiente")).toHaveText("1");
    await expect(page.getByRole("link", { name: /^1 orden a tiempo · ver en la lista$/ })).toHaveAttribute("href", "/admin/reportes?plazo=a-tiempo&tipo=instalacion");
    await expect(page.locator("main article")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("tab", { name: /Instalaciones/ })).toHaveAttribute("aria-selected", "true");
  });

  test("tiempo vivo: una orden que cruza las 72 h pasa sola a Vencidas, sin recargar", async ({ page }) => {
    const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    const order = await db.report.findFirstOrThrow({ where: { street: "Diagonal 30 # 54-10" } });
    const createdAt = new Date(Date.now() - (72 * 3600 - 30) * 1000); // le faltan 30 s para vencer
    await db.report.update({ where: { id: order.id }, data: { createdAt, dueAt: new Date(createdAt.getTime() + 72 * 3600_000) } });
    await db.$disconnect();

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, "admin");
    await page.clock.install();
    await page.goto("/admin");
    await expect(page.getByRole("region", { name: "Atención y por vencer" }).locator("article", { hasText: "Diagonal 30 # 54-10" })).toBeVisible();
    await page.clock.fastForward("01:05");
    await expect(page.getByRole("region", { name: "Vencidas" }).locator("article", { hasText: "Diagonal 30 # 54-10" })).toContainText(/Vencido hace/);
    await expect(page.getByRole("region", { name: "Atención y por vencer" }).locator("article", { hasText: "Diagonal 30 # 54-10" })).toHaveCount(0);
  });
});
