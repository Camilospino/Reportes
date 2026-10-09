-- Fecha de inicio (paso a En proceso) y de cierre por el técnico (Realizado).
ALTER TABLE "reports" ADD COLUMN "started_at" TIMESTAMPTZ(3);
ALTER TABLE "reports" ADD COLUMN "completed_at" TIMESTAMPTZ(3);

-- Inicio de los reportes que ya pasaron por En proceso: el último "TOMAR" de la bitácora.
UPDATE "reports" r
SET "started_at" = COALESCE(
  (SELECT MAX(a."created_at") FROM "audit_log" a WHERE a."report_id" = r."id" AND a."action" = 'TOMAR'),
  r."updated_at"
)
WHERE r."status" IN ('EN_PROCESO', 'REALIZADO', 'APLAZADO', 'CLIENTE_AUSENTE', 'VERIFICADO');

-- Cierre de los Realizados (y de los ya Verificados): el último "REALIZADO" de la bitácora y,
-- si no aparece, la última actualización del reporte.
UPDATE "reports" r
SET "completed_at" = COALESCE(
  (SELECT MAX(a."created_at") FROM "audit_log" a WHERE a."report_id" = r."id" AND a."action" = 'REALIZADO'),
  r."updated_at"
)
WHERE r."status" IN ('REALIZADO', 'VERIFICADO');

-- "Hechos hoy" del técnico.
CREATE INDEX "reports_assigned_to_id_completed_at_idx" ON "reports"("assigned_to_id", "completed_at");
