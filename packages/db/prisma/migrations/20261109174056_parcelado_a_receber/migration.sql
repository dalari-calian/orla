-- DropIndex
DROP INDEX "installment_plans_user_id_status_idx";

-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'expense';

-- CreateIndex
CREATE INDEX "installment_plans_user_id_type_status_idx" ON "installment_plans"("user_id", "type", "status");

-- Parcelado a receber: o plano tem tipo, e receita passa a aceitar a natureza "installment".
ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_type_check" CHECK ("type" IN ('income', 'expense'));

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_nature_check";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_nature_check" CHECK (
    ("type" = 'income' AND "nature" IN ('fixed', 'extra', 'installment')) OR
    ("type" = 'expense' AND "nature" IN ('fixed', 'variable', 'planned', 'installment'))
  );
