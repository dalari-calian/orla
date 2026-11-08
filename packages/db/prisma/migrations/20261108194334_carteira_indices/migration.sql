-- Mesmo ticker na mesma corretora = um ativo só (em outra corretora é outro ativo, RC-12).
CREATE UNIQUE INDEX "assets_user_ticker_account_key" ON "assets" ("user_id", upper("ticker"), COALESCE("account_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "ticker" IS NOT NULL AND "deleted_at" IS NULL;
-- Nome único por usuário nas classes de ativo (ignorando excluídas).
CREATE UNIQUE INDEX "asset_classes_user_name_key" ON "asset_classes" ("user_id", lower("name")) WHERE "deleted_at" IS NULL;
