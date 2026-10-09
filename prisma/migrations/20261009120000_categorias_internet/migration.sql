-- Categorías de daño de un proveedor de internet (reemplazan Eléctrico / Plomería / Estructural).
-- Los reportes con categorías anteriores pasan a "OTRO".
ALTER TYPE "DamageCategory" RENAME TO "DamageCategory_old";
CREATE TYPE "DamageCategory" AS ENUM ('SIN_SERVICIO', 'LENTITUD', 'FIBRA_CABLEADO', 'EQUIPO', 'WIFI', 'OTRO');
ALTER TABLE "reports" ALTER COLUMN "category" TYPE "DamageCategory" USING ('OTRO'::"DamageCategory");
DROP TYPE "DamageCategory_old";
