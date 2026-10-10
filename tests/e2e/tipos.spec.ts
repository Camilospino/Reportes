import { expect, login, test } from "./helpers";

/** Instalaciones, retiros, plazo y avisos, de punta a punta en la pantalla real. */
test.describe.serial("Instalaciones, retiros y plazos", () => {
  const street = "Calle 8 # 4-12 Instalación E2E";

  test("admin crea una instalación con dos equipos", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/reportes/nuevo");
    await page.getByRole("button", { name: /Instalación/ }).click();
    await page.getByRole("button", { name: /Publicar instalación/ }).click();
    await expect(page.getByText(/Faltan: .*Plan o velocidad/)).toBeVisible();

    await page.getByLabel("Plan o velocidad *").fill("500 Mbps");
    await page.getByLabel("Equipo 1: tipo *").fill("ONU");
    await page.getByRole("button", { name: "Agregar equipo" }).click();
    await page.getByLabel("Equipo 2: tipo *").fill("Router");
    await page.getByLabel("Serial (si lo conoce)").nth(1).fill("RT-777");
    await page.getByLabel("Calle / dirección *").fill(street);
    await page.getByLabel("Barrio *").fill("Manga");
    await page.getByLabel("Nombre del cliente *").fill("Cliente Instalación");
    await page.getByLabel("Teléfono del cliente *").fill("301 222 3344");
    await page.getByLabel("Número de contrato *").fill("CTG-INST-1");
    await page.getByRole("button", { name: /Publicar instalación/ }).click();

    await expect(page.getByText("Reporte creado y publicado como Pendiente.")).toBeVisible();
    const info = page.locator("main section", { hasText: street });
    await expect(info.getByText("Instalación", { exact: true }).first()).toBeVisible();
    await expect(info.getByText(/Vence en 72 h|Vence en 71 h/)).toBeVisible();
    await expect(info.getByRole("cell", { name: "RT-777" })).toBeVisible();
    await expect(info.getByText("500 Mbps")).toBeVisible();
  });

  test("técnico la toma y no puede cerrarla sin el serial de cada equipo", async ({ page }) => {
    await login(page, "tecnico1");
    await page.getByRole("tab", { name: /Disponibles/ }).click();
    const card = page.locator("article", { hasText: street });
    await card.getByRole("button", { expanded: false }).click();
    await card.getByRole("button", { name: "Tomar este reporte" }).click();
    await expect(page.getByRole("status").getByText(/^Tomó R-\d{6}\. Ya está a su cargo\.$/)).toBeVisible();

    const mine = page.locator("article", { hasText: street });
    await mine.getByRole("button", { name: "Marcar realizado" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Equipos instalados: serial de cada uno *")).toBeVisible();
    await sheet.getByTestId("camera-EVIDENCIA").setInputFiles("tests/e2e/fixtures/foto-celular.jpg");
    await expect(sheet.getByText("✓ Lista")).toBeVisible({ timeout: 20_000 });
    // El Router ya trae serial; falta el de la ONU.
    await expect(sheet.getByText("Escriba el serial de cada equipo instalado.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sí, realizado" })).toBeDisabled();
    await sheet.getByLabel("Serial de ONU (1)").fill("ONU-123");
    await sheet.getByRole("button", { name: "Sí, realizado" }).click();
    await expect(page.getByRole("status").getByText(/^R-\d{6} realizado\. Pasó a Mi historial\.$/)).toBeVisible();
  });

  test("admin la ve en 'Listas para verificar' con sus seriales y la verifica", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await login(page, "admin");
    await page.goto("/admin?tipo=instalacion");
    const card = page.getByRole("region", { name: "Listas para verificar" }).locator("article", { hasText: street });
    await expect(card).toContainText("Cumplió el plazo");
    await card.getByRole("link", { name: street }).click();
    await expect(page.getByRole("cell", { name: "ONU-123" })).toBeVisible();
    await page.goto("/admin?tipo=instalacion");
    await page.locator("article", { hasText: street }).getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^R-\d{6} verificado$/ })).toBeVisible();
    await expect(page.locator("article", { hasText: street })).toHaveCount(0);
  });

  test("retiro: un equipo no recibido cierra igual y el Panel avisa 'Equipo pendiente por recoger'", async ({ page, browser }) => {
    await login(page, "tecnico1");
    const card = page.locator("article", { hasText: "Carrera 17 # 25-08" });
    await card.getByRole("button", { expanded: false }).click();
    await card.getByRole("button", { name: "Marcar realizado" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("group", { name: "¿Recibió Router (1)?" }).getByRole("button", { name: "Sí, recibido" }).click();
    await sheet.getByLabel("Estado de Router (1)").selectOption("BUENO");
    await sheet.getByRole("group", { name: "¿Recibió Decodificador (2)?" }).getByRole("button", { name: "No recibido" }).click();
    await sheet.getByLabel("Observación de Decodificador (2)").fill("El cliente no lo entregó");
    await sheet.getByTestId("camera-EVIDENCIA").setInputFiles("tests/e2e/fixtures/foto-celular.jpg");
    await expect(sheet.getByText("✓ Lista")).toBeVisible({ timeout: 20_000 });
    await sheet.getByRole("button", { name: "Sí, realizado" }).click();
    await expect(page.getByRole("status").getByText(/^R-\d{6} realizado\./)).toBeVisible();

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const adminPage = await ctx.newPage();
    await login(adminPage, "admin");
    await adminPage.goto("/admin?tipo=retiro");
    const laneCard = adminPage.getByRole("region", { name: "Listas para verificar" }).locator("article", { hasText: "Carrera 17 # 25-08" });
    await expect(laneCard.getByText("Equipo pendiente", { exact: true })).toBeVisible();
    await laneCard.getByRole("link", { name: "Carrera 17 # 25-08" }).click();
    await expect(adminPage.getByRole("note")).toHaveText(/Equipo pendiente por recoger/);
    await expect(adminPage.getByText("El cliente no lo entregó").first()).toBeVisible();
    await ctx.close();
  });

  test("lista: pestañas por tipo y filtro de plazo en la URL", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await login(page, "admin");
    await page.goto("/admin/reportes");
    await page.getByRole("tab", { name: /Retiros/ }).click();
    await expect(page).toHaveURL(/tipo=retiro/);
    await expect(page.locator("main tbody tr")).toHaveCount(1);
    await expect(page.locator("main tbody tr").first()).toContainText("Carrera 17 # 25-08");
    await page.getByRole("tab", { name: /Todos/ }).click();
    await page.getByRole("group", { name: "Plazo" }).getByRole("button", { name: /Vencido/ }).click();
    await expect(page).toHaveURL(/plazo=vencido/);
    // Seed: el Aplazado de "Calle 70" (72 h) ya venció.
    await expect(page.locator("main tbody tr", { hasText: "Calle 70 # 40-20" })).toBeVisible();
    for (const r of await page.locator("main tbody tr").all()) await expect(r).toContainText(/Vencido hace/);
  });

  test("técnico ve el aviso fijo de órdenes por vencer y la campanita con sus avisos", async ({ page }) => {
    await login(page, "tecnico2");
    // Seed: "Carrera 10 # 41-60" lleva 60 h abierta y está asignada a tecnico2.
    const banner = page.getByRole("button", { name: /^Tiene \d+ (orden|órdenes) por vencer/ });
    await expect(banner).toBeVisible();
    await banner.click();
    await expect(page.locator("article", { hasText: "Carrera 10 # 41-60" }).getByRole("button", { expanded: true })).toBeVisible();

    const bell = page.getByRole("button", { name: /^Avisos: \d+ sin leer$/ });
    await bell.click();
    const panel = page.getByRole("dialog", { name: "Avisos" });
    await expect(panel.getByText(/está por vencer: quedan \d+ h\./)).toBeVisible();
    await panel.getByRole("button", { name: "Marcar todos como leídos" }).click();
    await expect(page.getByRole("button", { name: "Avisos", exact: true })).toBeVisible();
  });

  test("Panel: el carril Vencidas coincide con la lista filtrada, y Ajustes → Plazos guarda", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await login(page, "admin");
    await page.goto("/admin");
    const n = await page.getByRole("region", { name: "Vencidas" }).locator("article").count();
    expect(n).toBeGreaterThan(0);
    await page.goto("/admin/reportes?plazo=vencido");
    await expect(page.locator("main tbody tr")).toHaveCount(n);
    await page.goto("/admin");

    await page.getByRole("link", { name: "Ajustes" }).click();
    await page.getByLabel("Plazo en horas: Instalación").fill("48");
    await page.getByLabel("Avisar desde (horas): Instalación").fill("60");
    await page.getByRole("button", { name: "Guardar plazos" }).click();
    await expect(page.getByText("El aviso debe empezar antes de que venza el plazo.")).toBeVisible();
    await page.getByLabel("Avisar desde (horas): Instalación").fill("12");
    await page.getByRole("button", { name: "Guardar plazos" }).click();
    await expect(page.getByText(/Plazos guardados/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Plazo en horas: Instalación")).toHaveValue("48");
    // Se deja como estaba.
    await page.getByLabel("Plazo en horas: Instalación").fill("72");
    await page.getByLabel("Avisar desde (horas): Instalación").fill("24");
    await page.getByRole("button", { name: "Guardar plazos" }).click();
    await expect(page.getByText(/Plazos guardados/)).toBeVisible();
  });
});
