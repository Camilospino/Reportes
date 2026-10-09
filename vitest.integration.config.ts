import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL } from "./tests/e2e/test-env";

/** Pruebas de servicios contra la BD de pruebas (reportes_test). Requiere haber corrido test:e2e una vez. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    env: { DATABASE_URL: TEST_DATABASE_URL, STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: "./storage-test" },
    fileParallelism: false,
  },
});
