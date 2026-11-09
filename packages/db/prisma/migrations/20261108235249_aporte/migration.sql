-- CreateTable
CREATE TABLE "contribution_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "competence_month" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "class_split" JSONB NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_plan_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "asset_id" UUID,
    "new_asset" JSONB,
    "mode" TEXT NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "unit_price" DECIMAL(20,8) NOT NULL,
    "value_cents" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "executed_trade_id" UUID,
    "executed_at" TIMESTAMPTZ(3),

    CONSTRAINT "contribution_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "competence_month" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "account_id" UUID,
    "notes" TEXT,
    "contribution_plan_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contribution_plans_user_id_competence_month_idx" ON "contribution_plans"("user_id", "competence_month");

-- CreateIndex
CREATE INDEX "contribution_plan_items_plan_id_sort_order_idx" ON "contribution_plan_items"("plan_id", "sort_order");

-- CreateIndex
CREATE INDEX "contributions_user_id_competence_month_idx" ON "contributions"("user_id", "competence_month");

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plan_items" ADD CONSTRAINT "contribution_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "contribution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
