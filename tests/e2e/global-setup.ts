import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { TEST_DATABASE_URL, TEST_STORAGE_DIR } from "./test-env";

/**
 * Prepara una base de datos EXCLUSIVA para pruebas (reportes_test), nunca la de desarrollo:
 * la crea si no existe, la vacía, aplica migraciones y carga la semilla.
 * También genera una foto "de celular" grande para probar la compresión.
 */
export default async function globalSetup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (es "${dbName}")`);

  // Crear la BD de pruebas si no existe (conectándose a la BD "postgres" del mismo servidor).
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  const test = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  await test.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await test.$executeRawUnsafe("CREATE SCHEMA public");
  await test.$disconnect();

  rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, LOCAL_STORAGE_DIR: TEST_STORAGE_DIR, STORAGE_DRIVER: "local" };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });

  mkdirSync("tests/e2e/fixtures", { recursive: true });
  // 4000x3000 con ruido: pesa varios MB, como una foto real.
  const width = 4000;
  const height = 3000;
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
  await sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile("tests/e2e/fixtures/foto-celular.jpg");
}
