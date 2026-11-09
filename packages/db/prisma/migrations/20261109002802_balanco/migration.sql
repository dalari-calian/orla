-- CreateTable
CREATE TABLE "balances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "competence_month" DATE NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "contributions_cents" BIGINT,
    "dividends_cents" BIGINT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "closed_at" TIMESTAMPTZ(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_items" (
    "id" UUID NOT NULL,
    "balance_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "asset_id" UUID,
    "asset_class_id" UUID,
    "account_id" UUID,
    "label" TEXT NOT NULL,
    "ticker" TEXT,
    "quantity" DECIMAL(20,8),
    "price" DECIMAL(20,8),
    "value_cents" BIGINT NOT NULL,
    "dy" DECIMAL(10,4),
    "pvp" DECIMAL(10,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "balance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balances_user_id_reference_date_idx" ON "balances"("user_id", "reference_date");

-- CreateIndex
CREATE INDEX "balance_items_balance_id_sort_order_idx" ON "balance_items"("balance_id", "sort_order");

-- CreateIndex
CREATE INDEX "balance_items_ticker_idx" ON "balance_items"("ticker");

-- AddForeignKey
ALTER TABLE "balances" ADD CONSTRAINT "balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_items" ADD CONSTRAINT "balance_items_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Constraints que o Prisma não expressa (docs/03: enums como text + CHECK) ───
ALTER TABLE "balances"
  ADD CONSTRAINT "balances_status_check" CHECK ("status" IN ('draft', 'closed')),
  ADD CONSTRAINT "balances_source_check" CHECK ("source" IN ('manual', 'import'));
ALTER TABLE "balance_items"
  ADD CONSTRAINT "balance_items_kind_check" CHECK ("kind" IN ('asset', 'cash')),
  ADD CONSTRAINT "balance_items_values_check" CHECK ("value_cents" >= 0 AND ("quantity" IS NULL OR "quantity" >= 0) AND ("price" IS NULL OR "price" >= 0));
-- Um balanço por mês de competência (RB-01; refazer = editar o existente).
CREATE UNIQUE INDEX "balances_user_month_key" ON "balances" ("user_id", "competence_month") WHERE "deleted_at" IS NULL;
