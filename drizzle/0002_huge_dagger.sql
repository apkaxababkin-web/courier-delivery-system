ALTER TABLE `couriers` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `couriers` ADD `name` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `couriers` ADD `username` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `couriers` ADD `passwordHash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `couriers` ADD CONSTRAINT `couriers_username_unique` UNIQUE(`username`);