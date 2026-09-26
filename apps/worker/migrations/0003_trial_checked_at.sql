ALTER TABLE `trial` ADD `checked_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `trial_checked` ON `trial` (`checked_at`,`nct_id`);--> statement-breakpoint
UPDATE `trial` SET `checked_at` = `fetched_at`;
