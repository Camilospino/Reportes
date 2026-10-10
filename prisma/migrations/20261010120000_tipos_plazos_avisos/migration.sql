-- Tipos de orden (Daño, Instalación, Retiro), equipos, plazo de 72 h y avisos dentro de la app.
-- Los reportes existentes quedan como DANO, con su plazo calculado desde su fecha de creación.
-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DANO', 'INSTALACION', 'RETIRO');

-- CreateEnum
CREATE TYPE "EquipmentAction" AS ENUM ('INSTALAR', 'RETIRAR');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('BUENO', 'DANADO', 'INCOMPLETO');

-- CreateEnum
CREATE TYPE "WithdrawalReason" AS ENUM ('CANCELACION', 'CAMBIO_EQUIPO', 'MORA', 'OTRO');

-- CreateEnum
CREATE TYPE "DeadlineThreshold" AS ENUM ('H24', 'H48', 'VENCIDO');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "due_at" TIMESTAMPTZ(3),
ADD COLUMN     "met_deadline" BOOLEAN,
ADD COLUMN     "plan" VARCHAR(60),
ADD COLUMN     "suggested_date" DATE,
ADD COLUMN     "type" "OrderType" NOT NULL DEFAULT 'DANO',
ADD COLUMN     "warn_from_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "withdrawal_reason" "WithdrawalReason",
ADD COLUMN     "withdrawal_reason_other" VARCHAR(200),
ALTER COLUMN "category" DROP NOT NULL;

-- Plazo de los reportes existentes: 72 h corridas desde su creación (valor por defecto de los tres tipos).
UPDATE "reports" SET "due_at" = "created_at" + INTERVAL '72 hours';
-- Los que ya se marcaron Realizado conservan si cumplieron el plazo.
UPDATE "reports" SET "met_deadline" = ("completed_at" <= "due_at") WHERE "completed_at" IS NOT NULL;
ALTER TABLE "reports" ALTER COLUMN "due_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "report_equipment" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "serial" VARCHAR(80),
    "action" "EquipmentAction" NOT NULL,
    "received" BOOLEAN,
    "condition" "EquipmentCondition",
    "observation" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_config" (
    "type" "OrderType" NOT NULL,
    "deadline_hours" INTEGER NOT NULL DEFAULT 72,
    "warn_from_hours" INTEGER NOT NULL DEFAULT 24,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deadline_config_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "threshold" "DeadlineThreshold" NOT NULL,
    "message" VARCHAR(300) NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "name" VARCHAR(40) NOT NULL,
    "last_run_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "report_equipment_report_id_idx" ON "report_equipment"("report_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_created_at_idx" ON "notifications"("user_id", "read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_report_id_idx" ON "notifications"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_report_id_threshold_key" ON "notifications"("user_id", "report_id", "threshold");

-- CreateIndex
CREATE INDEX "reports_type_idx" ON "reports"("type");

-- CreateIndex
CREATE INDEX "reports_status_due_at_idx" ON "reports"("status", "due_at");

-- AddForeignKey
ALTER TABLE "report_equipment" ADD CONSTRAINT "report_equipment_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Configuración por defecto: 72 h de plazo y aviso desde las 24 h para los tres tipos.
INSERT INTO "deadline_config" ("type", "deadline_hours", "warn_from_hours", "updated_at") VALUES
  ('DANO', 72, 24, CURRENT_TIMESTAMP),
  ('INSTALACION', 72, 24, CURRENT_TIMESTAMP),
  ('RETIRO', 72, 24, CURRENT_TIMESTAMP);

-- Control de la revisión de plazos (como máximo cada 10 minutos desde las pantallas).
INSERT INTO "job_runs" ("name", "last_run_at") VALUES ('plazos', TIMESTAMPTZ '2000-01-01 00:00:00+00');
