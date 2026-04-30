CREATE TABLE `categories` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_slug` text
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`meta_title` text,
	`meta_description` text,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`category` text,
	`tags` text,
	`author_name` text NOT NULL,
	`author_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`indexnow_sent` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category`) REFERENCES `categories`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_unique` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_status_idx` ON `articles` (`status`);--> statement-breakpoint
CREATE INDEX `articles_published_at_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_category_idx` ON `articles` (`category`);
