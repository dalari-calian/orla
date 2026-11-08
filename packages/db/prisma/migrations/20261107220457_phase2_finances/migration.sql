-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "payee_id" UUID,
    "category_id" UUID,
    "credit_card_id" UUID,
    "account_id" UUID,
    "payment_method" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "installments_count" SMALLINT NOT NULL,
    "first_competence_month" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "paid_off_at" DATE,
    "payoff_discount_cents" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "competence_month" DATE NOT NULL,
    "date" DATE NOT NULL,
    "category_id" UUID,
    "account_id" UUID,
    "payee_id" UUID,
    "payment_method" TEXT,
    "credit_card_id" UUID,
    "recurring_template_id" UUID,
    "installment_plan_id" UUID,
    "installment_number" SMALLINT,
    "parent_planned_id" UUID,
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_settings" (
    "user_id" UUID NOT NULL,
    "competence_month" DATE NOT NULL,
    "savings_goal_cents" BIGINT,
    "notes" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "month_settings_pkey" PRIMARY KEY ("user_id","competence_month")
);

-- CreateIndex
CREATE INDEX "installment_plans_user_id_status_idx" ON "installment_plans"("user_id", "status");

-- CreateIndex
CREATE INDEX "transactions_user_id_competence_month_idx" ON "transactions"("user_id", "competence_month");

-- CreateIndex
CREATE INDEX "transactions_user_id_installment_plan_id_idx" ON "transactions"("user_id", "installment_plan_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_credit_card_id_competence_month_idx" ON "transactions"("user_id", "credit_card_id", "competence_month");

-- CreateIndex
CREATE INDEX "transactions_user_id_payee_id_idx" ON "transactions"("user_id", "payee_id");

-- CreateIndex
CREATE INDEX "transactions_parent_planned_id_idx" ON "transactions"("parent_planned_id");

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_template_id_fkey" FOREIGN KEY ("recurring_template_id") REFERENCES "recurring_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_plan_id_fkey" FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parent_planned_id_fkey" FOREIGN KEY ("parent_planned_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_settings" ADD CONSTRAINT "month_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Constraints que o Prisma não expressa (docs/03: enums como text + CHECK) ───

ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_status_check" CHECK ("status" IN ('active', 'paid_off', 'canceled')),
  ADD CONSTRAINT "installment_plans_payment_method_check" CHECK ("payment_method" IN ('pix', 'debit', 'credit', 'cash', 'boleto', 'transfer', 'other')),
  ADD CONSTRAINT "installment_plans_credit_card_check" CHECK ("payment_method" <> 'credit' OR "credit_card_id" IS NOT NULL),
  ADD CONSTRAINT "installment_plans_total_check" CHECK ("total_cents" > 0),
  ADD CONSTRAINT "installment_plans_count_check" CHECK ("installments_count" BETWEEN 1 AND 480),
  ADD CONSTRAINT "installment_plans_first_month_check" CHECK (extract(day from "first_competence_month") = 1);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_type_check" CHECK ("type" IN ('income', 'expense')),
  ADD CONSTRAINT "transactions_nature_check" CHECK (
    ("type" = 'income' AND "nature" IN ('fixed', 'extra')) OR
    ("type" = 'expense' AND "nature" IN ('fixed', 'variable', 'planned', 'installment'))
  ),
  ADD CONSTRAINT "transactions_status_check" CHECK ("status" IN ('forecast', 'settled')),
  ADD CONSTRAINT "transactions_amount_check" CHECK ("amount_cents" > 0),
  ADD CONSTRAINT "transactions_competence_month_check" CHECK (extract(day from "competence_month") = 1),
  ADD CONSTRAINT "transactions_payment_method_check" CHECK ("payment_method" IS NULL OR "payment_method" IN ('pix', 'debit', 'credit', 'cash', 'boleto', 'transfer', 'other')),
  ADD CONSTRAINT "transactions_credit_card_check" CHECK ("payment_method" IS DISTINCT FROM 'credit' OR "credit_card_id" IS NOT NULL),
  ADD CONSTRAINT "transactions_source_check" CHECK ("source" IN ('manual', 'import', 'template', 'plan', 'bot')),
  ADD CONSTRAINT "transactions_installment_number_check" CHECK ("installment_number" IS NULL OR "installment_number" >= 1),
  ADD CONSTRAINT "transactions_not_own_parent_check" CHECK ("parent_planned_id" IS NULL OR "parent_planned_id" <> "id");

ALTER TABLE "month_settings"
  ADD CONSTRAINT "month_settings_competence_month_check" CHECK (extract(day from "competence_month") = 1),
  ADD CONSTRAINT "month_settings_goal_check" CHECK ("savings_goal_cents" IS NULL OR "savings_goal_cents" >= 0);

-- RF-11: um lançamento por modelo e mês. Sem filtrar excluídos de propósito: um lançamento
-- gerado que o usuário apagou não deve reaparecer quando o mês for aberto de novo.
CREATE UNIQUE INDEX "transactions_template_month_key" ON "transactions" ("recurring_template_id", "competence_month") WHERE "recurring_template_id" IS NOT NULL;

-- Uma parcela de cada número por parcelamento (ignorando excluídas).
CREATE UNIQUE INDEX "transactions_plan_number_key" ON "transactions" ("installment_plan_id", "installment_number") WHERE "installment_plan_id" IS NOT NULL AND "installment_number" IS NOT NULL AND "deleted_at" IS NULL;
