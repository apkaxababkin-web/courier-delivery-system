CREATE TABLE `couriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(255) NOT NULL,
	`username` varchar(100) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`phone` varchar(20),
	`vehicleType` enum('bicycle','scooter','car','foot') NOT NULL DEFAULT 'scooter',
	`isActive` boolean NOT NULL DEFAULT true,
	`totalDeliveries` int NOT NULL DEFAULT 0,
	`urgencyThresholdOrange` int NOT NULL DEFAULT 60,
	`urgencyThresholdRed` int NOT NULL DEFAULT 30,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `couriers_id` PRIMARY KEY(`id`),
	CONSTRAINT `couriers_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `hemotestPickupPoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hemotestPickupPoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hemotestPickups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pointId` int NOT NULL,
	`courierId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`isPicked` boolean NOT NULL DEFAULT false,
	`pickedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hemotestPickups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sberbankPickupPoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sberbankPickupPoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sberbankPickups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pointId` int NOT NULL,
	`courierId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`isPicked` boolean NOT NULL DEFAULT false,
	`pickedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sberbankPickups_id` PRIMARY KEY(`id`)
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
	`status` enum('pending','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`taskType` enum('regular','warehouse_pickup','courier_call') NOT NULL DEFAULT 'regular',
	`recipientName` varchar(255) NOT NULL,
	`recipientPhone` varchar(20),
	`deliveryAddress` text NOT NULL,
	`deliveryCity` varchar(100),
	`packageDescription` text,
	`packageType` enum('document','small','medium','large','fragile') NOT NULL DEFAULT 'small',
	`specialInstructions` text,
	`placesCount` int NOT NULL DEFAULT 1,
	`estimatedMinutes` int,
	`deliveryTimeFrom` varchar(5),
	`deliveryTimeTo` varchar(5),
	`recipientAddress` text,
	`senderName` varchar(255),
	`senderAddress` text,
	`senderPhone` varchar(20),
	`comments` text,
	`courierComments` text,
	`items` text,
	`rejectionReason` text,
	`scheduledAt` timestamp,
	`acceptedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
