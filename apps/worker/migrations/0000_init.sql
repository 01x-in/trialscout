CREATE TABLE `city` (
	`geonameid` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country_code` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`population` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `city_country` ON `city` (`country_code`);--> statement-breakpoint
CREATE TABLE `city_name` (
	`key` text NOT NULL,
	`geonameid` integer NOT NULL,
	PRIMARY KEY(`key`, `geonameid`),
	FOREIGN KEY (`geonameid`) REFERENCES `city`(`geonameid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `country` (
	`code` text PRIMARY KEY NOT NULL,
	`iso3` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `country_name_key` ON `country` (`name_key`);--> statement-breakpoint
CREATE TABLE `criterion` (
	`nct_id` text NOT NULL,
	`version` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`nct_id`, `version`, `position`),
	FOREIGN KEY (`nct_id`) REFERENCES `trial`(`nct_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nct_id` text NOT NULL,
	`facility` text,
	`city` text,
	`state` text,
	`country` text,
	`status` text,
	`lat` real,
	`lon` real,
	FOREIGN KEY (`nct_id`) REFERENCES `trial`(`nct_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_nct_id` ON `site` (`nct_id`);--> statement-breakpoint
CREATE TABLE `trial` (
	`nct_id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`phases` text NOT NULL,
	`sponsor` text,
	`conditions` text NOT NULL,
	`status` text NOT NULL,
	`criteria` text,
	`sex` text NOT NULL,
	`min_age_years` real,
	`max_age_years` real,
	`split_version` text,
	`split_ok` integer,
	`fetched_at` integer NOT NULL
);
