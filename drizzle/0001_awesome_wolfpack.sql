CREATE TABLE `couriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(20),
	`vehicleType` enum('bicycle','scooter','car','foot') NOT NULL DEFAULT 'scooter',
	`isActive` boolean NOT NULL DEFAULT true,
	`totalDeliveries` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `couriers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskStatusHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`status` varchar(50) NOT NULL,
	`changedByUserId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskStatusHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int,
	`courierId` int,
	`status` enum('pending','assigned','accepted','in_progress','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`recipientName` varchar(255) NOT NULL,
	`recipientPhone` varchar(20),
	`deliveryAddress` text NOT NULL,
	`deliveryCity` varchar(100),
	`packageDescription` text,
	`packageType` enum('document','small','medium','large','fragile') NOT NULL DEFAULT 'small',
	`specialInstructions` text,
	`estimatedMinutes` int,
	`rejectionReason` text,
	`scheduledAt` timestamp,
	`acceptedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
