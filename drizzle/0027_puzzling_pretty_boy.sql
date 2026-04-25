CREATE TABLE `managers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`username` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`phone` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managers_id` PRIMARY KEY(`id`),
	CONSTRAINT `managers_username_unique` UNIQUE(`username`),
	CONSTRAINT `managers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `notificationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courierId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`newTasks` boolean NOT NULL DEFAULT true,
	`statusChanges` boolean NOT NULL DEFAULT true,
	`messages` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `couriers` ADD `expoPushToken` text;--> statement-breakpoint
ALTER TABLE `notificationSettings` ADD CONSTRAINT `notificationSettings_courierId_couriers_id_fk` FOREIGN KEY (`courierId`) REFERENCES `couriers`(`id`) ON DELETE cascade ON UPDATE no action;