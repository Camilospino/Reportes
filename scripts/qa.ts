/**
 * Entorno QA local: la versión compilada de la app, con BD, fotos y compilación propias.
 * Flujo: se cambia el código en desarrollo (localhost:3100) y, cuando está listo para probar,
 * se "sube a QA" (localhost:3300). Lo que pasa en desarrollo no afecta QA hasta el siguiente deploy.
 *
 *   npm run qa:deploy   compila el código actual en .next-qa y aplica migraciones a reportes_qa
 *   npm run qa:start    sirve QA en http://localhost:3300 (también desde el celular en la misma red)
 *
 * La configuración vive en .env.qa (se crea desde .env.qa.example la primera vez).
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";

const QA_PORT = 3300;
const QA_DIST_DIR = ".next-qa";
const ENV_FILE = ".env.qa";

function qaEnv(): NodeJS.ProcessEnv {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(".env.qa.example", ENV_FILE);
    console.log(`Se creó ${ENV_FILE} a partir de .env.qa.example.`);
  }
  // Las variables de .env.qa tienen prioridad sobre las de .env (Next no sobrescribe process.env).
  const fileVars = parseEnv(readFileSync(ENV_FILE, "utf8")) as Record<string, string>;
  const env: NodeJS.ProcessEnv = { ...process.env, ...fileVars, NEXT_DIST_DIR: QA_DIST_DIR };
  const dbName = new URL(env.DATABASE_URL ?? "").pathname.slice(1);
  if (!dbName.endsWith("_qa")) throw new Error(`Por seguridad, la BD de QA debe terminar en _qa (es "${dbName}")`);
  return env;
}

async function deploy() {
  const env = qaEnv();
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env });

  // Crear la BD de QA si no existe (conectándose a la BD "postgres" del mismo servidor).
  const dbName = new URL(env.DATABASE_URL!).pathname.slice(1);
  const adminUrl = new URL(env.DATABASE_URL!);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`Base de datos ${dbName} creada.`);
  }
  await admin.$disconnect();

  run("npx prisma migrate deploy");

  // Datos de demostración solo la primera vez: los deploys siguientes conservan lo que se probó.
  const qa = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const users = await qa.user.count();
  await qa.$disconnect();
  if (users === 0) run("npx tsx prisma/seed.ts");

  run("npx next build");
  console.log(`\nQA compilado. Si QA ya estaba abierto, deténgalo (Ctrl+C) y ejecute: npm run qa:start`);
}

function start() {
  const env = qaEnv();
  if (!existsSync(`${QA_DIST_DIR}/BUILD_ID`)) {
    console.error("QA aún no está compilado. Ejecute primero: npm run qa:deploy");
    process.exit(1);
  }
  console.log(`QA en http://localhost:${QA_PORT}`);
  execSync(`npx next start -p ${QA_PORT} -H 0.0.0.0`, { stdio: "inherit", env });
}

const command = process.argv[2];
if (command === "deploy") {
  deploy().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (command === "start") {
  start();
} else {
  console.error("Uso: tsx scripts/qa.ts deploy|start");
  process.exit(1);
}
