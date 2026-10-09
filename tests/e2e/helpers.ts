import { test as base, expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "Cambiar.2026";

/**
 * `test` con guardia automática: cualquier error de consola, excepción de JavaScript
 * o violación de la CSP en el navegador hace FALLAR la prueba.
 */
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        // "Failed to load resource" se valida abajo con el detalle de la respuesta.
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console.error: ${m.text()}`);
      });
      page.on("response", (r) => {
        // Un 404/401 del documento puede ser lo esperado; un script, estilo o imagen fallido nunca.
        if (r.status() >= 400 && r.request().resourceType() !== "document" && !r.url().includes("/api/")) {
          errors.push(`recurso ${r.status()}: ${r.url()}`);
        }
      });
      page.on("pageerror", (e) => errors.push(`excepción: ${e.message}`));
      await use(errors);
      expect(errors, "errores en el navegador").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
