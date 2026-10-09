import { expect, login, test } from "./helpers";
import { BASE_URL } from "./test-env";

test.describe.serial("Flujo principal", () => {
  let reportUrlPath = "";

  test("admin crea un reporte y queda Pendiente", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/reportes/nuevo");
    // La plantilla llena categoría, prioridad y descripción (con espacios ____ por completar).
    await page.getByRole("button", { name: /Sin internet/ }).click();
    await expect(page.getByLabel("Categoría *")).toHaveValue("SIN_SERVICIO");
    await expect(page.getByRole("button", { name: "Alta", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Calle / dirección *").fill("Calle 100 # 20-30");
    await page.getByLabel("Barrio *").fill("Bocagrande");
    await page.getByLabel("Punto de referencia").fill("Edificio gris");
    await page.getByLabel("Nombre del cliente *").fill("Prueba E2E");
    await page.getByLabel("Teléfono del cliente *").fill("300 000 0000");
    await page.getByLabel("Número de contrato *").fill("ctg-000999");
    // Con espacios ____ sin completar no se publica.
    await page.getByRole("button", { name: "Publicar reporte" }).click();
    await expect(page.getByText("Faltan: Descripción.")).toBeVisible();
    await page.getByLabel("Descripción del posible daño *").fill("Sin internet desde ayer. Luces del router: LOS en rojo.");
    await page.getByRole("button", { name: "Publicar reporte" }).click();
    await expect(page.getByText("Reporte creado y publicado como Pendiente.")).toBeVisible();
    await expect(page.locator("main").getByText("Pendiente").first()).toBeVisible();
    reportUrlPath = new URL(page.url()).pathname;
  });

  test("REALIZADO sin foto: el botón Enviar está bloqueado", async ({ page }) => {
    await login(page, "tecnico2");
    await page.getByRole("link", { name: /Calle 100 # 20-30/ }).click();
    await page.getByRole("button", { name: "Tomar reporte" }).click();
    await page.getByRole("button", { name: "✅ Realizado" }).click();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(page.getByText("Tome al menos una foto para poder enviar.")).toBeVisible();
    // Liberar para que el siguiente test lo haga desde cero.
    await page.getByRole("button", { name: "Volver" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Liberar reporte/ }).click();
    await expect(page.getByText("Reporte liberado.")).toBeVisible();
  });

  test("fotos de Android con tipo vacío se aceptan; archivos que no son foto se rechazan", async ({ page }) => {
    const fs = await import("node:fs");
    await login(page, "tecnico2");
    await page.getByRole("link", { name: /Calle 100 # 20-30/ }).click();
    await page.getByRole("button", { name: "Tomar reporte" }).click();
    await page.getByRole("button", { name: "🚪 Cliente ausente" }).click();
    const picker = page.getByTestId("camera-FACHADA");
    await picker.setInputFiles({ name: "IMG_0001", mimeType: "", buffer: fs.readFileSync("tests/e2e/fixtures/foto-celular.jpg") });
    await expect(page.getByText("✓ Lista")).toBeVisible({ timeout: 20_000 });
    await picker.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("no soy una foto") });
    await expect(page.getByText("No se pudo leer el archivo como foto. Tómela de nuevo.")).toBeVisible();
    // Liberar para el siguiente test
    await page.getByRole("button", { name: "Volver" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Liberar reporte/ }).click();
    await expect(page.getByText("Reporte liberado.")).toBeVisible();
  });

  test("técnico completa el flujo desde el celular en menos de 1 minuto", async ({ page }) => {
    await login(page, "tecnico1");
    const start = Date.now();

    await page.getByRole("link", { name: /Calle 100 # 20-30/ }).click();
    await expect(page.getByRole("link", { name: /Abrir en Google Maps/ })).toHaveAttribute("href", /google\.com\/maps/);
    await page.getByRole("button", { name: "Tomar reporte" }).click();
    await page.getByRole("button", { name: "✅ Realizado" }).click();
    await page.getByTestId("camera-EVIDENCIA").setInputFiles("tests/e2e/fixtures/foto-celular.jpg");
    await expect(page.getByText("✓ Lista")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Nota (opcional)").fill("Se cambió el breaker.");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Resultado enviado. ¡Gracias!")).toBeVisible();

    const seconds = (Date.now() - start) / 1000;
    console.log(`Flujo del técnico: ${seconds.toFixed(1)} s (automatizado)`);
    expect(seconds).toBeLessThan(60);

    // Aparece en su historial
    await page.goto("/tecnico/historial");
    await expect(page.getByText("Calle 100 # 20-30")).toBeVisible();
  });

  test("la foto se comprimió (≤ ~1 MB) y solo la ven usuarios autorizados", async ({ page, browser }) => {
    await login(page, "admin");
    await page.goto(reportUrlPath);
    const img = page.locator('img[alt="Evidencia"]').first();
    await expect(img).toBeVisible();
    const src = (await img.getAttribute("src"))!;
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/jpeg");
    expect((await res.body()).length).toBeLessThan(1_100_000);

    // tecnico2 nunca trabajó este reporte (lo liberó antes, pero sí hay rastro en la bitácora)
    // => sí puede verlo; usamos un contexto sin sesión para comprobar el bloqueo.
    const anon = await browser.newContext();
    expect((await anon.request.get(`${BASE_URL}${src}`)).status()).toBe(401);
    await anon.close();
  });

  test("admin verifica el cierre y todo queda en la bitácora", async ({ page }) => {
    await login(page, "admin");
    await page.goto(reportUrlPath);
    await page.getByRole("button", { name: "✔ Verificar cierre" }).click();
    await page.getByRole("button", { name: /Confirmar: Verificar cierre/ }).click();
    await expect(page.locator("main").getByText("Verificado").first()).toBeVisible();

    const history = page.locator("section", { has: page.getByRole("heading", { name: "Historial" }) });
    for (const t of ["Creó el reporte", "Tomó el reporte", "Liberó el reporte", "Marcó como realizado", "Verificó el cierre"]) {
      await expect(history.getByText(t).first()).toBeVisible();
    }
    await expect(history.getByText("Se cambió el breaker.")).toBeVisible();
  });

  test("admin rechaza un cierre con comentario y vuelve a Pendiente", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/reportes?estado=REALIZADO");
    // Fila → panel lateral → reporte completo.
    await page.locator("main tr", { hasText: "Carrera 3 # 8-100" }).first().click();
    await page.getByRole("dialog").getByRole("link", { name: "Abrir reporte completo" }).click();
    await page.getByRole("button", { name: "✖ Rechazar cierre" }).click();
    const confirm = page.getByRole("button", { name: /Confirmar: Rechazar cierre/ });
    await expect(confirm).toBeDisabled(); // comentario obligatorio
    await page.getByLabel(/Comentario/).fill("Falta foto del tablero.");
    await confirm.click();
    await expect(page.locator("main").getByText("Pendiente").first()).toBeVisible();
  });

  test("filtros y búsqueda sin tildes", async ({ page }) => {
    await login(page, "admin");
    // "getsemani" sin tilde encuentra el barrio "Getsemaní".
    await page.goto("/admin/reportes?q=getsemani&estado=PENDIENTE");
    await expect(page.locator("main").getByText(/con los filtros actuales/)).toBeVisible();
    await expect(page.locator("main").getByText("Carrera 10 # 41-60").first()).toBeVisible();
    await expect(page.locator("main").getByText("Carrera 2 # 9-145")).toHaveCount(0);
  });

  test("lista: filtros al instante y asignar técnico desde el panel", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/reportes");
    // Sin botón "Filtrar": la búsqueda se aplica sola y queda en la URL.
    await page.getByRole("searchbox", { name: "Buscar reportes" }).fill("pie de la popa");
    await expect(page).toHaveURL(/q=pie/);
    await expect(page.locator("main tbody tr")).toHaveCount(1);
    await expect(page.locator("main tbody tr").first()).toContainText("Pie de la Popa");
    // Buscar por código.
    await page.getByRole("searchbox", { name: "Buscar reportes" }).fill("R-000001");
    await expect(page).toHaveURL(/q=R-000001/);
    await expect(page.locator("main tbody tr")).toHaveCount(1);
    await expect(page.locator("main tbody tr").first()).toContainText("Carrera 2 # 9-145");
    await page.locator("main tbody tr").first().click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel("Técnico asignado").selectOption({ label: "Laura Gómez" });
    await expect(page.getByRole("status").filter({ hasText: "Asignado a Laura Gómez" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.locator("main tbody tr").first()).toContainText("Laura Gómez");
    // Deja la semilla como estaba (sin asignar).
    await page.locator("main tbody tr").first().click();
    await panel.getByLabel("Técnico asignado").selectOption("");
    await expect(page.getByRole("status").filter({ hasText: "Sin técnico asignado" })).toBeVisible();
  });

  test("admin crea técnico, este cambia la clave temporal al entrar", async ({ page, browser }) => {
    await login(page, "admin");
    await page.goto("/admin/usuarios");
    await page.getByLabel("Nombre completo *").fill("Pedro Nuevo");
    await page.getByLabel("Usuario *").fill("pnuevo");
    await page.getByRole("button", { name: "Crear técnico" }).click();
    const temp = (await page.locator("strong.select-all").textContent())!.trim();
    expect(temp).toHaveLength(10);

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE_URL}/login`);
    await p2.getByLabel("Usuario", { exact: true }).fill("pnuevo");
    await p2.getByLabel("Contraseña", { exact: true }).fill(temp);
    await p2.getByRole("button", { name: "Ingresar" }).click();
    await expect(p2).toHaveURL(/\/cambiar-clave$/);
    // Mientras no la cambie, no puede usar la app.
    await p2.goto(`${BASE_URL}/tecnico`);
    await expect(p2).toHaveURL(/\/cambiar-clave$/);
    await p2.getByLabel("Contraseña actual (o temporal)").fill(temp);
    await p2.getByLabel("Nueva contraseña", { exact: true }).fill("MiClave2026");
    await p2.getByLabel("Repita la nueva contraseña").fill("MiClave2026");
    await p2.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(p2).toHaveURL(/\/tecnico\?msg=clave$/);
    await ctx.close();
  });
});
