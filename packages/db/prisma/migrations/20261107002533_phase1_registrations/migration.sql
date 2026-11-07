-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "default_savings_goal_cents" BIGINT,
    "default_savings_goal_pct" DECIMAL(7,4),
    "card_competence" TEXT NOT NULL DEFAULT 'due_month',
    "contribution_timing" TEXT NOT NULL DEFAULT 'end',
    "return_contribution_source" TEXT NOT NULL DEFAULT 'contributions',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "hide_values" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "closing_day" SMALLINT NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "limit_cents" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "monthly_budget_cents" BIGINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payees" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_category_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "category_id" UUID,
    "account_id" UUID,
    "payee_id" UUID,
    "payment_method" TEXT,
    "credit_card_id" UUID,
    "frequency" TEXT NOT NULL,
    "month_of_year" SMALLINT,
    "day_of_month" SMALLINT NOT NULL,
    "start_month" DATE NOT NULL,
    "end_month" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "recurring_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards"("user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_kind_idx" ON "categories"("user_id", "kind");

-- CreateIndex
CREATE INDEX "payees_user_id_idx" ON "payees"("user_id");

-- CreateIndex
CREATE INDEX "recurring_templates_user_id_idx" ON "recurring_templates"("user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Constraints que o Prisma não expressa (docs/03: enums como text + CHECK) ───

ALTER TABLE "user_settings"
  ADD CONSTRAINT "user_settings_card_competence_check" CHECK ("card_competence" IN ('due_month', 'closing_month')),
  ADD CONSTRAINT "user_settings_contribution_timing_check" CHECK ("contribution_timing" IN ('end', 'start', 'dietz')),
  ADD CONSTRAINT "user_settings_return_source_check" CHECK ("return_contribution_source" IN ('contributions', 'trades')),
  ADD CONSTRAINT "user_settings_theme_check" CHECK ("theme" IN ('light', 'dark', 'system')),
  ADD CONSTRAINT "user_settings_goal_check" CHECK (
    ("default_savings_goal_cents" IS NULL OR "default_savings_goal_pct" IS NULL)
    AND ("default_savings_goal_cents" IS NULL OR "default_savings_goal_cents" >= 0)
    AND ("default_savings_goal_pct" IS NULL OR "default_savings_goal_pct" BETWEEN 0 AND 100)
  );

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_kind_check" CHECK ("kind" IN ('checking', 'savings', 'brokerage', 'wallet', 'other'));

ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_closing_day_check" CHECK ("closing_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "credit_cards_due_day_check" CHECK ("due_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "credit_cards_limit_check" CHECK ("limit_cents" IS NULL OR "limit_cents" >= 0);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_kind_check" CHECK ("kind" IN ('income', 'expense')),
  ADD CONSTRAINT "categories_budget_check" CHECK ("monthly_budget_cents" IS NULL OR "monthly_budget_cents" >= 0),
  ADD CONSTRAINT "categories_not_own_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "recurring_templates"
  ADD CONSTRAINT "recurring_templates_type_check" CHECK ("type" IN ('income', 'expense')),
  ADD CONSTRAINT "recurring_templates_nature_check" CHECK ("nature" IN ('fixed', 'planned')),
  ADD CONSTRAINT "recurring_templates_payment_method_check" CHECK ("payment_method" IS NULL OR "payment_method" IN ('pix', 'debit', 'credit', 'cash', 'boleto', 'transfer', 'other')),
  ADD CONSTRAINT "recurring_templates_frequency_check" CHECK ("frequency" IN ('monthly', 'yearly')),
  ADD CONSTRAINT "recurring_templates_amount_check" CHECK ("amount_cents" > 0),
  ADD CONSTRAINT "recurring_templates_day_check" CHECK ("day_of_month" BETWEEN 1 AND 31),
  ADD CONSTRAINT "recurring_templates_month_of_year_check" CHECK (
    ("frequency" = 'monthly' AND "month_of_year" IS NULL)
    OR ("frequency" = 'yearly' AND "month_of_year" BETWEEN 1 AND 12)
  ),
  ADD CONSTRAINT "recurring_templates_start_month_check" CHECK (extract(day from "start_month") = 1),
  ADD CONSTRAINT "recurring_templates_end_month_check" CHECK ("end_month" IS NULL OR (extract(day from "end_month") = 1 AND "end_month" >= "start_month")),
  ADD CONSTRAINT "recurring_templates_credit_card_check" CHECK ("payment_method" IS DISTINCT FROM 'credit' OR "credit_card_id" IS NOT NULL);

-- Nomes únicos por usuário (sem diferenciar maiúsculas), ignorando registros excluídos.
CREATE UNIQUE INDEX "payees_user_id_name_key" ON "payees" ("user_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "categories_user_id_kind_parent_name_key" ON "categories" ("user_id", "kind", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts" ("user_id", lower("name")) WHERE "deleted_at" IS NULL;
