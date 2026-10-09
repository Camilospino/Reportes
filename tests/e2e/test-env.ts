/** Configuración de las pruebas E2E: BD y almacenamiento separados de los de desarrollo. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://reportes:reportes@localhost:5434/reportes_test?schema=public";
export const TEST_STORAGE_DIR = "./storage-test";
export const TEST_PORT = 3200;
export const BASE_URL = `http://localhost:${TEST_PORT}`;
