# Despliegue en producción

Tiempo estimado: 1–2 horas la primera vez.

## 1. Requisitos y costos

| Recurso | Recomendación | Costo aprox. |
|---|---|---|
| VPS | Hetzner CX22 (2 vCPU, 4 GB, 40 GB) o DigitalOcean/Vultr de 1–2 GB, Ubuntu 24.04 | USD 5–7/mes ≈ COP 20.000–30.000 |
| Dominio | `.com` o `.com.co` | COP 60.000–110.000/año ≈ COP 5.000–9.000/mes |
| Cloudflare R2 | 2 buckets privados (fotos y respaldos) | Gratis hasta 10 GB; luego USD 0,015/GB-mes |
| **Total** | | **≈ COP 30.000–45.000/mes** |

> Referencia de volumen: 1.000 reportes/mes × 2 fotos × ~400 KB ≈ 0,8 GB/mes → el plan gratuito de R2 alcanza para ~1 año.
> Los precios son estimados a la fecha de entrega (tasa ≈ COP 4.000/USD); verifíquelos al contratar.

## 2. Cloudflare R2

1. En Cloudflare → R2 → crear buckets **`reportes-fotos`** y **`reportes-respaldos`** (ambos privados, sin acceso público).
2. En `reportes-respaldos` → *Settings → Object lifecycle rules*: eliminar objetos con más de **30 días**.
3. R2 → *Manage API tokens* → crear token con permiso **Object Read & Write** limitado a esos dos buckets.
   Anote `Access Key ID`, `Secret Access Key` y el endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

## 3. Servidor

```bash
# Como root en el VPS recién creado
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw unattended-upgrades
curl -fsSL https://get.docker.com | sh

# Firewall: solo SSH y web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Usuario para la app
adduser --disabled-password --gecos "" reportes && usermod -aG docker reportes
```

Recomendado: entrar por SSH con llave y deshabilitar el acceso con contraseña (`PasswordAuthentication no`).

## 4. DNS

Cree un registro **A** del dominio (ej. `reportes.suempresa.com`) apuntando a la IP del VPS.
Espere a que resuelva (`ping reportes.suempresa.com`) antes de iniciar: Caddy necesita el DNS para emitir el certificado.

## 5. Aplicación

```bash
su - reportes
git clone <URL-del-repositorio> app && cd app
cp .env.production.example .env
nano .env        # complete los valores (ver tabla abajo)
chmod 600 .env

docker compose up -d --build
docker compose ps            # app, db, caddy y backup "Up"; migrate "Exited (0)"
```

Crear el primer administrador (use una contraseña fuerte):

```bash
docker compose run --rm \
  -e ADMIN_USERNAME=ana -e ADMIN_NAME="Ana Martínez" -e ADMIN_PASSWORD='UnaClave-Larga-2026' \
  migrate npm run admin:create
```

Abra `https://reportes.suempresa.com`, ingrese y cree los técnicos en **Técnicos**.

> No ejecute `npm run db:seed` en producción: carga datos de demostración (está bloqueado salvo `ALLOW_DEMO_SEED=1`).

## 6. Variables de entorno (`.env` de producción)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DOMAIN` | Sí | Dominio sin `https://` (lo usa Caddy) |
| `APP_URL` | Sí | `https://` + dominio. Activa cookies `Secure`/`__Host-`, HSTS y CSP estricta |
| `POSTGRES_USER` / `POSTGRES_DB` | Sí | Usuario y nombre de la base |
| `POSTGRES_PASSWORD` | Sí | Larga y aleatoria: `openssl rand -base64 32` |
| `STORAGE_DRIVER` | Sí | `s3` en producción (`local` solo para desarrollo) |
| `S3_ENDPOINT` | Sí | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | No | `auto` para R2 |
| `S3_BUCKET` | Sí | Bucket de fotos |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Sí | Token de R2 |
| `BACKUP_S3_BUCKET` | Recomendada | Bucket de respaldos. Si está vacía, los respaldos solo quedan en el VPS |

`DATABASE_URL` la arma `docker-compose.yml` a partir de las variables `POSTGRES_*`.

## 7. Respaldos

- **Automático:** todos los días a las 3:00 a. m. (hora Colombia) el contenedor `backup` ejecuta `pg_dump`,
  guarda 7 días en `./backups` del VPS y sube una copia a R2 (retenida 30 días por la regla de ciclo de vida).
- **Manual:** `docker compose exec backup backup.sh`
- **Ver registros:** `docker compose logs backup`
- **Restaurar** (reemplaza los datos actuales):
  ```bash
  docker compose stop app
  docker compose exec backup restore.sh /backups/reportes_2026-10-08_0300.dump
  docker compose start app
  ```
  Para restaurar desde R2, descargue el archivo a `./backups/` primero.
- Las **fotos** están en R2, que replica los datos internamente; no requieren respaldo adicional en esta fase.
- **Pruebe una restauración cada 3 meses** en un servidor de prueba. Un respaldo que nunca se probó no es un respaldo.

## 8. Actualizar a una nueva versión

```bash
cd ~/app
docker compose exec backup backup.sh     # respaldo previo, por si acaso
git pull
docker compose up -d --build             # migrate aplica las migraciones nuevas antes de arrancar la app
docker image prune -f
```

## 9. Operación

| Tarea | Comando |
|---|---|
| Estado | `docker compose ps` |
| Logs de la app | `docker compose logs -f app` |
| Reiniciar | `docker compose restart app` |
| Consola SQL | `docker compose exec db psql -U reportes` |
| Uso de disco | `df -h` y `du -sh ~/app/backups` |

Monitoreo gratuito recomendado: [UptimeRobot](https://uptimerobot.com) o Better Stack apuntando a
`https://<dominio>/api/health` (avisa por correo si la app o la BD caen).

## 10. Lista de verificación de salida a producción

- [ ] `https://` carga con candado y `http://` redirige a `https://`
- [ ] El admin inicial ingresa; se crearon los técnicos con su contraseña temporal
- [ ] Un técnico completó un reporte de prueba desde su celular, con foto
- [ ] `docker compose exec backup backup.sh` sube el archivo al bucket de respaldos
- [ ] Se probó una restauración
- [ ] Monitoreo de `/api/health` configurado
- [ ] Se borró el reporte de prueba (o se canceló) y se guardó `.env` en un gestor de contraseñas
