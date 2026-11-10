-- AlterTable
ALTER TABLE "month_settings" ADD COLUMN     "carryover_dismissed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "carryover_mode" TEXT NOT NULL DEFAULT 'ask';

-- Saldo do mês anterior (RF-54): natureza própria, nas entradas (sobrou) ou saídas (faltou).
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_nature_check";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_nature_check" CHECK (
    ("type" = 'income' AND "nature" IN ('fixed', 'extra', 'installment', 'carryover')) OR
    ("type" = 'expense' AND "nature" IN ('fixed', 'variable', 'planned', 'installment', 'carryover'))
  );

-- No máximo um saldo anterior ativo por mês.
CREATE UNIQUE INDEX "transactions_user_id_carryover_month_key"
  ON "transactions" ("user_id", "competence_month")
  WHERE "nature" = 'carryover' AND "deleted_at" IS NULL;

ALTER TABLE "user_settings"
  ADD CONSTRAINT "user_settings_carryover_mode_check" CHECK ("carryover_mode" IN ('ask', 'auto', 'off'));
