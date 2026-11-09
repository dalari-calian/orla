-- ─── Constraints que o Prisma não expressa (docs/03: enums como text + CHECK) ───

ALTER TABLE "contribution_plans"
  ADD CONSTRAINT "contribution_plans_status_check" CHECK ("status" IN ('draft', 'executed', 'discarded')),
  ADD CONSTRAINT "contribution_plans_total_check" CHECK ("total_cents" >= 0);

ALTER TABLE "contribution_plan_items"
  ADD CONSTRAINT "contribution_plan_items_mode_check" CHECK ("mode" IN ('by_value', 'by_quantity')),
  ADD CONSTRAINT "contribution_plan_items_asset_check" CHECK ("asset_id" IS NOT NULL OR "new_asset" IS NOT NULL),
  ADD CONSTRAINT "contribution_plan_items_values_check" CHECK ("quantity" >= 0 AND "unit_price" >= 0 AND "value_cents" >= 0);

-- Uma simulação principal por mês (RA-30).
CREATE UNIQUE INDEX "contribution_plans_primary_key" ON "contribution_plans" ("user_id", "competence_month") WHERE "is_primary" AND "deleted_at" IS NULL;

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_kind_check" CHECK ("kind" IN ('bug', 'improvement')),
  ADD CONSTRAINT "feedback_status_check" CHECK ("status" IN ('pending', 'approved', 'in_progress', 'review', 'done', 'rejected')),
  ADD CONSTRAINT "feedback_priority_check" CHECK ("priority" IS NULL OR "priority" IN ('low', 'medium', 'high'));

ALTER TABLE "feedback_events"
  ADD CONSTRAINT "feedback_events_actor_check" CHECK ("actor" IN ('owner', 'agent', 'user'));
