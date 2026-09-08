-- The migrator runs this migration in one transaction. Lock both tables before
-- translating the legacy spelling so no concurrent writer can bypass checks or
-- snapshot protection. All other row values and release metadata are retained.
LOCK TABLE "part", "release_part" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "part" DROP CONSTRAINT "part_status";--> statement-breakpoint
ALTER TABLE "release_part" DROP CONSTRAINT "release_part_status";--> statement-breakpoint
UPDATE "part" SET "status" = 'obsolete' WHERE "status" = 'discontinued';
--> statement-breakpoint
-- Published and inactive snapshots need the same semantic status rename.
-- Suspend only this table's mutation trigger, under the lock and transaction;
-- rollback restores it automatically if any migration statement fails.
ALTER TABLE "release_part" DISABLE TRIGGER "snapshot_immutable";
--> statement-breakpoint
UPDATE "release_part" SET "status" = 'obsolete' WHERE "status" = 'discontinued';
--> statement-breakpoint
ALTER TABLE "release_part" ENABLE TRIGGER "snapshot_immutable";
--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_status" CHECK ("part"."status" IN ('active','superseded','obsolete','special-order'));--> statement-breakpoint
ALTER TABLE "release_part" ADD CONSTRAINT "release_part_status" CHECK ("release_part"."status" IN ('active','superseded','obsolete','special-order'));
--> statement-breakpoint
CREATE TRIGGER import_staging_no_delete BEFORE DELETE ON import_staging_row
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
