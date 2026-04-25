CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text NOT NULL,
	`contactPerson` varchar(255),
	`phone` varchar(20),
	`email` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`waybillNumber` varchar(50) NOT NULL,
	`recipientName` varchar(255),
	`recipientPhone` varchar(20) NOT NULL,
	`deliveryAddress` text NOT NULL,
	`mailStatus` enum('not_delivered','delivered') NOT NULL DEFAULT 'not_delivered',
	`recipientSignature` text,
	`deliveredAt` timestamp,
	`courierId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mails_id` PRIMARY KEY(`id`),
	CONSTRAINT `mails_waybillNumber_unique` UNIQUE(`waybillNumber`)
);
--> statement-breakpoint
CREATE TABLE `sberbankPickupSchedule` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dayOfWeek` int NOT NULL,
	`pointId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sberbankPickupSchedule_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `status` enum('assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'assigned';