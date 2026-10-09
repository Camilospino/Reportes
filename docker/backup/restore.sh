#!/bin/sh
# Restaura un respaldo. ¡REEMPLAZA los datos actuales!
#   docker compose stop app
#   docker compose exec backup restore.sh /backups/reportes_2026-10-08_0300.dump
#   docker compose start app
set -eu
FILE="${1:?Uso: restore.sh /backups/archivo.dump}"
printf "Esto reemplaza la base %s con %s. Escriba SI para continuar: " "$PGDATABASE" "$FILE"
read -r ok
[ "$ok" = "SI" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "$FILE"
echo "Restauración completada."
