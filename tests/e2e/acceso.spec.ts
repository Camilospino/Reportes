import { expect, login, test } from "./helpers";
import { BASE_URL } from "./test-env";

test.describe("Control de acceso", () => {
  test("sin sesión, toda página protegida redirige a /login", async ({ page }) => {
    for (const url of ["/admin", "/admin/usuarios", "/tecnico", "/tecnico/historial"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("las APIs rechazan peticiones sin sesión", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await request.get(`/api/fotos/${id}`)).status()).toBe(401);
    const up = await request.post(`/api/reportes/${id}/fotos`, {
      headers: { origin: BASE_URL },
      multipart: { kind: "EVIDENCIA", file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
    });
    expect(up.status()).toBe(401);
  });

  test("un técnico NO accede a funciones de administrador forzando URLs", async ({ page }) => {
    await login(page, "tecnico1");
    await expect(page).toHaveURL(/\/tecnico$/);
    for (const url of ["/admin", "/admin/reportes", "/admin/reportes/nuevo", "/admin/usuarios"]) {
      await page.goto(url);
      await expect(page, `${url} debe redirigir`).toHaveURL(/\/tecnico$/);
      await expect(page.getByRole("heading", { name: /Panel|Técnicos|Nuevo reporte/ })).toHaveCount(0);
    }
  });

  test("un técnico no ve reportes asignados a otro técnico", async ({ page }) => {
    await login(page, "tecnico1");
    // Control positivo: sí ve uno libre (si no, la aserción de abajo pasaría con la página vacía).
    await expect(page.getByText("Carrera 2 # 9-145")).toBeVisible();
    // El reporte de "Carrera 10 # 41-60" está asignado a tecnico2 (semilla).
    await expect(page.getByText("Carrera 10 # 41-60")).toHaveCount(0);
  });

  test("subida de fotos rechaza otro origen (CSRF)", async ({ page }) => {
    await login(page, "tecnico1");
    const res = await page.request.post(`/api/reportes/00000000-0000-4000-8000-000000000000/fotos`, {
      headers: { origin: "https://sitio-malicioso.com" },
      multipart: { kind: "EVIDENCIA", file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(403);
  });

  test("un técnico no puede subir fotos a un reporte que no tiene en proceso", async ({ page }) => {
    await login(page, "tecnico1");
    // Abrir un reporte disponible (no tomado) y tratar de subirle foto vía API.
    await page.getByRole("link", { name: /Carrera 2 # 9-145/ }).click();
    await page.waitForURL(/\/tecnico\/reportes\//);
    const reportId = page.url().split("/").pop()!;
    const res = await page.request.post(`/api/reportes/${reportId}/fotos`, {
      headers: { origin: BASE_URL },
      multipart: { kind: "EVIDENCIA", file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(403);
  });

  test("página 404 funciona con la CSP (sin scripts bloqueados)", async ({ page }) => {
    const res = await page.goto("/no-existe-esta-pagina");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontrado" })).toBeVisible();
    await page.getByRole("link", { name: "Ir al inicio" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("reporte inexistente o con id inválido responde 404 al técnico", async ({ page }) => {
    await login(page, "tecnico1");
    for (const id of ["00000000-0000-4000-8000-000000000000", "no-es-un-uuid"]) {
      const res = await page.goto(`/tecnico/reportes/${id}`);
      expect(res?.status()).toBe(404);
    }
  });

  test("encabezados de seguridad presentes", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("login: credenciales incorrectas muestran mensaje genérico", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("noexiste");
    await page.getByLabel("Contraseña", { exact: true }).fill("loquesea");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
  });
});
