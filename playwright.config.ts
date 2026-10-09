import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, TEST_DATABASE_URL, TEST_PORT, TEST_STORAGE_DIR } from "./tests/e2e/test-env";

/**
 * Pruebas de extremo a extremo sobre una BD aparte (reportes_test), que se recrea en cada corrida.
 *   npm run test:e2e   (compila en .next-e2e: no toca la compilación de desarrollo ni la de QA)
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
  },
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx next start -p ${TEST_PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: TEST_DATABASE_URL, LOCAL_STORAGE_DIR: TEST_STORAGE_DIR, STORAGE_DRIVER: "local", APP_URL: BASE_URL },
    timeout: 60_000,
  },
});
