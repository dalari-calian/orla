-- CreateTable
CREATE TABLE "asset_classes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_allocations" (
    "asset_class_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_pct" DECIMAL(7,4) NOT NULL,
    "max_pct" DECIMAL(7,4),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "target_allocations_pkey" PRIMARY KEY ("asset_class_id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_class_id" UUID NOT NULL,
    "ticker" TEXT,
    "name" TEXT NOT NULL,
    "account_id" UUID,
    "quote_mode" TEXT NOT NULL DEFAULT 'auto',
    "fixed_income_info" JSONB,
    "target_weight_pct" DECIMAL(7,4),
    "max_weight_pct" DECIMAL(7,4),
    "manual_price" DECIMAL(20,8),
    "manual_price_at" TIMESTAMPTZ(3),
    "manual_value_cents" BIGINT,
    "manual_value_at" TIMESTAMPTZ(3),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_trades" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "unit_price" DECIMAL(20,8) NOT NULL,
    "fees_cents" BIGINT NOT NULL DEFAULT 0,
    "total_cents" BIGINT NOT NULL,
    "split_ratio" DECIMAL(20,8),
    "contribution_plan_id" UUID,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "pay_date" DATE NOT NULL,
    "ex_date" DATE,
    "amount_cents" BIGINT NOT NULL,
    "gross_cents" BIGINT,
    "quantity_base" DECIMAL(20,8),
    "per_share" DECIMAL(20,8),
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes_cache" (
    "ticker" TEXT NOT NULL,
    "price" DECIMAL(20,8),
    "change_pct" DECIMAL(12,6),
    "name" TEXT,
    "quoted_at" TIMESTAMPTZ(3),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "error_at" TIMESTAMPTZ(3),
    "error" TEXT,

    CONSTRAINT "quotes_cache_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "provider_cache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "provider" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("provider","month")
);

-- CreateIndex
CREATE INDEX "asset_classes_user_id_idx" ON "asset_classes"("user_id");

-- CreateIndex
CREATE INDEX "target_allocations_user_id_idx" ON "target_allocations"("user_id");

-- CreateIndex
CREATE INDEX "assets_user_id_idx" ON "assets"("user_id");

-- CreateIndex
CREATE INDEX "assets_ticker_idx" ON "assets"("ticker");

-- CreateIndex
CREATE INDEX "asset_trades_user_id_trade_date_idx" ON "asset_trades"("user_id", "trade_date");

-- CreateIndex
CREATE INDEX "asset_trades_asset_id_idx" ON "asset_trades"("asset_id");

-- CreateIndex
CREATE INDEX "dividends_user_id_pay_date_idx" ON "dividends"("user_id", "pay_date");

-- CreateIndex
CREATE INDEX "dividends_asset_id_idx" ON "dividends"("asset_id");

-- AddForeignKey
ALTER TABLE "asset_classes" ADD CONSTRAINT "asset_classes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_allocations" ADD CONSTRAINT "target_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_allocations" ADD CONSTRAINT "target_allocations_asset_class_id_fkey" FOREIGN KEY ("asset_class_id") REFERENCES "asset_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_class_id_fkey" FOREIGN KEY ("asset_class_id") REFERENCES "asset_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trades" ADD CONSTRAINT "asset_trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trades" ADD CONSTRAINT "asset_trades_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
