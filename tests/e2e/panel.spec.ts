import { expect, login, test } from "./helpers";

/** Bandeja del Panel del administrador, con los reportes de la semilla que no tocan las otras pruebas. */
test.describe.serial("Panel del administrador", () => {
  test("celular: reprogramar un Aplazado con nota; vuelve a Pendiente con el mismo técnico", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin?f=aplazado");
    await expect(page.getByRole("tab", { name: /Aplazados/ })).toHaveAttribute("aria-selected", "true");
    const pendientes = page.getByRole("link", { name: /Pendiente/ }).first();
    const before = Number(await pendientes.locator("span").last().innerText());

    await page.getByRole("button", { name: /Calle 70 # 40-20/ }).click();
    await expect(page).toHaveURL(/f=aplazado&id=R-\d{6}/);
    const detail = page.getByRole("region", { name: "Detalle del reporte" });
    await expect(detail.getByRole("heading", { name: "Calle 70 # 40-20" })).toBeVisible();
    await expect(detail.getByText("No hay rollo de fibra drop en bodega; llega el jueves.")).toBeVisible(); // historial
    await detail.getByLabel("Nota para el técnico (opcional)").fill("Ya llegó el rollo de fibra.");
    await expect(detail.getByText("27/500")).toBeVisible();
    await detail.getByRole("button", { name: /^Reprogramar/ }).last().click();

    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} vuelve a Pendiente con Carlos Pérez$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Calle 70 # 40-20/ })).toHaveCount(0);
    await expect(pendientes.locator("span").last()).toHaveText(String(before + 1));

    // En la lista de reportes: Pendiente y con el mismo técnico.
    await page.goto("/admin/reportes?q=Calle 70");
    const row = page.locator("main tbody tr", { hasText: "Calle 70 # 40-20" });
    await expect(row).toContainText("Pendiente");
    await expect(row).toContainText("Carlos Pérez");
  });

  test("escritorio: cancelar con el teclado pide confirmación en línea", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await login(page, "admin");
    await page.goto("/admin?f=ausente");
    await page.getByRole("button", { name: /Avenida Pedro de Heredia # 23-45/ }).click();
    const detail = page.getByRole("region", { name: "Detalle del reporte" });
    await expect(detail.getByRole("heading", { name: "Avenida Pedro de Heredia # 23-45" })).toBeVisible();

    await page.keyboard.press("c");
    await expect(detail.getByText(/^¿Cancelar R-\d{6}\?$/).first()).toBeVisible();
    await detail.getByRole("button", { name: "No" }).first().click();
    await expect(detail.getByRole("button", { name: /^Cancelar reporte/ }).first()).toBeVisible();

    await detail.getByRole("button", { name: /^Cancelar reporte/ }).first().click();
    await detail.getByRole("button", { name: "Sí, cancelar" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} cancelado$/ })).toBeVisible();
    await expect(page.getByText("Bandeja vacía")).toBeVisible();
  });
});
