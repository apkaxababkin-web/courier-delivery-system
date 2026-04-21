ALTER TABLE `tasks` ADD `senderAddressUrl` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recipientAddressUrl` text;--> statement-breakpoint
ALTER TABLE `couriers` DROP COLUMN `preferredNavigator`;