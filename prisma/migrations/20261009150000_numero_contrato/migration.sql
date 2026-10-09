-- Número de contrato del cliente. Queda NULL en los reportes creados antes de este cambio.
ALTER TABLE "reports" ADD COLUMN "contract_number" VARCHAR(30);
