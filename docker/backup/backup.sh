#!/bin/sh
# Respaldo de PostgreSQL: formato custom (comprimido) → /backups (7 días) → R2 (retención por regla de ciclo de vida).
set -eu
STAMP=$(date +%Y-%m-%d_%H%M)
FILE="/backups/reportes_${STAMP}.dump"

pg_dump --format=custom --no-owner --file="$FILE"
echo "[backup] $(date) creado $FILE ($(du -h "$FILE" | cut -f1))"

# Mantener solo 7 días en el disco del servidor.
find /backups -name 'reportes_*.dump' -mtime +7 -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
    aws s3 cp "$FILE" "s3://${BACKUP_S3_BUCKET}/db/$(basename "$FILE")" --endpoint-url "$S3_ENDPOINT" --only-show-errors
  echo "[backup] subido a s3://${BACKUP_S3_BUCKET}/db/"
else
  echo "[backup] AVISO: BACKUP_S3_BUCKET vacío; el respaldo solo queda en el servidor."
fi
