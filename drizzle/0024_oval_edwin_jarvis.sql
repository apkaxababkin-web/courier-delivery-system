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
ALTER TABLE `notificationSettings` ADD CONSTRAINT `notificationSettings_courierId_couriers_id_fk` FOREIGN KEY (`courierId`) REFERENCES `couriers`(`id`) ON DELETE cascade ON UPDATE no action;