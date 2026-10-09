# Reportes de daños

Aplicación web *mobile-first* para gestionar reportes de daños en campo.
El **administrador** crea y verifica reportes; el **técnico** los toma desde el celular,
visita el sitio y registra el resultado con fotos.

**Stack:** Next.js 16 (TypeScript) · PostgreSQL 16 + Prisma · Tailwind CSS · Cloudflare R2 (fotos) ·
Docker Compose + Caddy (HTTPS) en un VPS. Costo de infraestructura estimado: **≈ COP 30.000–45.000/mes**.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Arquitectura, modelo de datos, máquina de estados, seguridad, decisiones |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Puesta en producción paso a paso, variables de entorno, respaldos, costos |
| [docs/MANUAL_ADMIN.md](docs/MANUAL_ADMIN.md) | Manual del administrador |
| [docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md) | Manual del técnico (para imprimir/enviar) |
| [docs/MEJORAS_FUTURAS.md](docs/MEJORAS_FUTURAS.md) | Mejoras fuera del presupuesto actual |

## Desarrollo local (5 minutos)

Requisitos: Node.js ≥ 20.9 y Docker.

```bash
npm install
cp .env.example .env          # valores listos para desarrollo
npm run db:up                 # PostgreSQL 16 en Docker (puerto 5434)
npx prisma migrate deploy     # crea las tablas
npm run db:seed               # 1 admin, 2 técnicos, 10 reportes de ejemplo
npm run dev                   # http://localhost:3100
```

Usuarios de ejemplo (contraseña `Cambiar.2026`): **admin**, **tecnico1**, **tecnico2**.
Para probar desde el celular en la misma red: `http://<IP-de-su-PC>:3100`.

## Entornos: desarrollo y QA

| | Desarrollo | QA |
|---|---|---|
| URL | http://localhost:3100 | http://localhost:3300 |
| Arranque | `npm run dev` | `npm run qa:deploy` y luego `npm run qa:start` |
| ¿Cambios automáticos? | Sí, al guardar | No: solo con un nuevo `qa:deploy` |
| Base de datos | `reportes` | `reportes_qa` (mismo PostgreSQL de Docker) |
| Fotos | `./storage` | `./storage-qa` |
| Configuración | `.env` | `.env.qa` (se crea desde `.env.qa.example`) |

Flujo: **desarrollo → QA → producción**. Cuando un cambio está listo para probar, se "sube a QA":

```bash
# Si QA está abierto, deténgalo primero (Ctrl+C): qa:deploy no compila con QA corriendo.
npm run qa:deploy   # compila el código actual en .next-qa y migra reportes_qa (la 1.ª vez carga datos de ejemplo)
npm run qa:start    # abre QA en http://localhost:3300
```

QA conserva sus datos entre deploys. Usa una cookie de sesión propia, así que se puede tener
sesión abierta en desarrollo y en QA a la vez. Desde el celular: `http://<IP-de-su-PC>:3300`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3100) |
| `npm run build` / `npm start` | Compilación y servidor de producción local |
| `npm run qa:deploy` / `npm run qa:start` | Subir el código actual a QA y abrirlo en el puerto 3300 |
| `npm run typecheck` | Verificación de tipos (TypeScript estricto) |
| `npm test` | Pruebas unitarias (reglas de negocio, validaciones) |
| `npm run test:e2e` | Pruebas de extremo a extremo en navegador (celular emulado). Compila en `.next-e2e` (no interfiere con `npm run dev`). Usa una BD aparte `reportes_test`. Fallan ante cualquier error de consola, violación de CSP o recurso que no cargue |
| `npm run test:integration` | Pruebas de servicios contra `reportes_test` (correr después de `test:e2e`) |
| `npm run db:migrate` | Crear una migración nueva tras cambiar `prisma/schema.prisma` |
| `npm run db:seed` | Cargar datos de demostración |
| `npm run admin:create` | Crear/restablecer un administrador (producción) |

## Estructura

```
src/
  domain/        Reglas de negocio puras (sin BD ni Next): estados, validaciones Zod, textos
  server/        Lógica de servidor: sesiones, servicios de reportes/usuarios, fotos, bitácora
  app/
    (auth)/      Login, cambio de contraseña y sus acciones
    admin/       Pantallas y acciones del administrador
    tecnico/     Pantallas y acciones del técnico (incluye el selector de fotos)
    api/         Subida/entrega de fotos y healthcheck
  components/    Componentes de interfaz reutilizables
  lib/           Utilidades compartidas (fechas en hora Colombia, compresión, reintentos)
  proxy.ts       CSP con nonce + redirección rápida a /login
prisma/          Esquema, migraciones SQL y datos semilla
docker/          Caddyfile y contenedor de respaldos
tests/           unit/ · integration/ · e2e/
```

**Regla para quien continúe el proyecto:** toda modificación de datos pasa por `src/server/reports.ts`
o `src/server/users.ts`; las Server Actions solo autentican (`actionContext`), validan (Zod) y delegan.
Las reglas de qué puede hacer quién viven en `src/domain/report-state.ts`.
