# Arquitectura

## Vista general

```
 Celular / PC ──HTTPS──▶ Caddy (TLS automático, límite 8 MB)
                              │
                              ▼
                    Next.js 16 (un solo proceso)
                    ├─ Páginas (Server Components): leen la BD directamente
                    ├─ Server Actions: crear/editar/cambiar estado (CSRF integrado)
                    ├─ /api/reportes/:id/fotos  (subida, valida origen/rol/tamaño/tipo)
                    └─ /api/fotos/:id           (entrega con control de acceso)
                         │                       │
                         ▼                       ▼
                   PostgreSQL 16          Cloudflare R2 (bucket privado)
                         │
                         ▼
               Respaldo diario pg_dump ──▶ disco (7 días) + R2
```

**Por qué un monolito Next.js:** un solo proyecto, un solo despliegue, un solo lenguaje.
Para ~10–50 usuarios es más que suficiente y cualquier desarrollador TypeScript puede continuarlo.
No hay API REST separada que mantener ni CORS.

**Por qué VPS y no Vercel + Supabase:** Vercel Hobby prohíbe uso comercial y Supabase Free pausa
el proyecto tras 7 días sin uso y no incluye respaldos. Sus planes pagos suman ≈ USD 45/mes
(≈ COP 180.000), por encima del tope. Un VPS de ≈ USD 5–7 cubre todo.

## Modelo de datos

```
users ─┬─< sessions                 (1 usuario : N sesiones)
       ├─< reports.assigned_to_id   (técnico asignado, opcional)
       ├─< reports.created_by_id    (admin que lo creó)
       ├─< attachments.uploaded_by_id
       └─< audit_log.actor_id

reports ─┬─< attachments            (fotos)
         └─< audit_log              (historial)

audit_log ─< attachments.audit_log_id   (fotos de un evento concreto)
```

| Tabla | Campos clave | Notas |
|---|---|---|
| `users` | username (único, minúsculas), password_hash (argon2id), role, active, must_change_password | Se desactivan, no se borran (la bitácora los referencia) |
| `sessions` | id = SHA-256 del token, expires_at | El token en claro solo existe en la cookie |
| `reports` | code (consecutivo R-000123), dirección, category, priority, cliente, status, assigned_to_id, rescheduled_for, search_text, **version** | `version` = concurrencia optimista; `search_text` = dirección sin tildes, con índice trigram |
| `attachments` | report_id, audit_log_id (NULL mientras no se envía), kind (EVIDENCIA/FACHADA), storage_key | Siempre JPEG re-codificado ≤ 1600 px |
| `audit_log` | actor_id, entity, action, from_status, to_status, data (jsonb), comment, ip, **request_id (único)** | Solo inserciones. Es la bitácora y el historial |

Migraciones SQL en `prisma/migrations/` (la segunda agrega `pg_trgm` y restricciones CHECK).

## Máquina de estados

Definida en `src/domain/report-state.ts` (única fuente de verdad, cubierta por pruebas):

| Acción | Desde | Hacia | Quién | Requisito |
|---|---|---|---|---|
| TOMAR | Pendiente | En proceso | Técnico | Sin asignar o asignado a él |
| LIBERAR | En proceso | Pendiente | Técnico dueño | — |
| REALIZADO | En proceso | Realizado | Técnico dueño | **≥ 1 foto** (nota opcional) |
| APLAZADO | En proceso | Aplazado | Técnico dueño | **Motivo** (fecha opcional ≥ hoy) |
| CLIENTE_AUSENTE | En proceso | Cliente ausente | Técnico dueño | **Fecha/hora del intento** (foto fachada opcional) |
| VERIFICAR | Realizado | Verificado | Admin | — |
| RECHAZAR | Realizado | Pendiente | Admin | **Comentario** |
| REPROGRAMAR | Aplazado / Cliente ausente | Pendiente | Admin | **Comentario** |
| CANCELAR | Pendiente / En proceso / Aplazado / Cliente ausente | Cancelado | Admin | **Comentario** |

Al rechazar/reprogramar, el reporte conserva el técnico asignado y este ve la observación del admin.

### Cómo se aplica un cambio de estado (`applyTransition`)

1. Si el `requestId` ya existe en la bitácora → ya se aplicó (reintento por mala señal) → éxito sin repetir.
2. Se valida la transición con la máquina de estados (rol, estado, dueño).
3. En **una transacción**:
   `UPDATE reports … WHERE id = ? AND status = ? AND version = ?` (si otro usuario se adelantó, 0 filas → error claro),
   `INSERT audit_log`, y se vinculan las fotos (deben ser del mismo reporte, del mismo técnico, no usadas, del tipo correcto).
   Si cualquier paso falla, no queda nada a medias.

## Seguridad

| Riesgo | Medida |
|---|---|
| Contraseñas | argon2id (m=19 MiB, t=2, p=1 — mínimo OWASP); política: ≥ 8 caracteres con letras y números; contraseña temporal obligatoria de cambiar |
| Fuerza bruta | 5 intentos **fallidos** por usuario y 30 por IP cada 15 min (los ingresos correctos no cuentan); mismo mensaje y mismo tiempo de respuesta exista o no el usuario |
| Sesiones | Token de 256 bits; cookie `__Host-sid` HttpOnly + Secure + SameSite=Lax; se invalidan al desactivar usuario o restablecer clave |
| Control de acceso | `requireRole()` en **cada** página y Server Action; `getApiUser()` en cada API. El `proxy.ts` solo redirige (no es barrera de seguridad, cf. CVE-2025-29927). Técnico sin acceso a un reporte → 404 |
| CSRF | Server Actions: verificación de Origin integrada de Next.js. API de fotos: verificación de `Origin` explícita. SameSite=Lax |
| XSS | React escapa todo; CSP con nonce por petición y `strict-dynamic` (todas las páginas se renderizan dinámicamente para llevar nonce, incluida la 404); sin `dangerouslySetInnerHTML` |
| Inyección SQL | Prisma (consultas parametrizadas); sin SQL construido con texto del usuario |
| Validación | Zod en el servidor para toda entrada (+ en el cliente para respuesta rápida); CHECK en la BD |
| Archivos | Límite 8 MB en Caddy, 5 MB en la app; tipo detectado por contenido (JPEG/PNG/WEBP); re-codificación con sharp (elimina contenido incrustado y EXIF/GPS); máx. 50 MP; bucket privado; fotos solo vía API con permisos |
| Transporte | HTTPS obligatorio (Caddy + HSTS), `upgrade-insecure-requests` |
| Otros encabezados | X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; sin `X-Powered-By` |

## Conexión inestable

- Fotos comprimidas en el celular (≤ 1600 px, ≤ ~1 MB; una foto de 5 MB queda en 300–600 KB).
- Cada foto **se sube en cuanto se toma**, en segundo plano, con 5 reintentos (1, 2, 4, 8 s) y botón "Reintentar".
- El envío del resultado se reintenta automáticamente y es **idempotente** (`requestId`): nunca se duplica.
- Páginas renderizadas en el servidor: poco JavaScript, carga rápida en 3G.

## Rendimiento

- Listados paginados (20 por página) con índices por estado, técnico, prioridad y fecha.
- Búsqueda por dirección con índice GIN trigram sobre texto normalizado.
- Fotos con caché privada de 1 día en el navegador.

## Decisiones y limitaciones conocidas

- **Un solo servidor:** el límite de intentos de login vive en memoria. Si algún día hay varias instancias, moverlo a PostgreSQL/Redis.
- **Fotos huérfanas:** si un técnico sube fotos y no envía el resultado, quedan sin vincular (no visibles). Volumen despreciable; ver Mejoras futuras.
- **Zona horaria:** todo se muestra en hora de Colombia (UTC-5, sin horario de verano).
