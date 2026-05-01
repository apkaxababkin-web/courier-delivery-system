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
	`pushToken` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `couriers_id` PRIMARY KEY(`id`),
	CONSTRAINT `couriers_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `hemotestListItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`pointId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hemotestListItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hemotestPickupLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int,
	`date` varchar(10) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hemotestPickupLists_id` PRIMARY KEY(`id`)
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
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int NOT NULL,
	`requestType` enum('delivery','movement','nuts','courier_call','pickup_from_tc','simple') NOT NULL,
	`requestStatus` enum('pending','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`courierId` int,
	`clientId` int,
	`recipientName` varchar(255),
	`recipientPhone` varchar(20),
	`recipientAddress` text,
	`deliveryAddress` text,
	`deliveryCity` varchar(100),
	`packageDescription` text,
	`packageType` enum('document','small','medium','large','fragile'),
	`placesCount` int DEFAULT 1,
	`senderName` varchar(255),
	`senderCompany` varchar(255),
	`senderCity` varchar(100),
	`senderAddress` text,
	`senderPhone` varchar(20),
	`recipientCompany` varchar(255),
	`recipientCity` varchar(100),
	`items` text,
	`totalAmount` decimal(10,2),
	`callReason` text,
	`tcName` varchar(255),
	`tcAddress` text,
	`trackingNumber` varchar(100),
	`description` text,
	`specialInstructions` text,
	`comments` text,
	`paymentMethod` enum('paid','transfer','cash','terminal','qr'),
	`paymentAmount` decimal(10,2),
	`deliveryTimeFrom` varchar(5),
	`deliveryTimeTo` varchar(5),
	`estimatedMinutes` int,
	`scheduledAt` timestamp,
	`acceptedAt` timestamp,
	`completedAt` timestamp,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sberbankListItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`pointId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sberbankListItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sberbankPickupLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int,
	`dayOfWeek` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sberbankPickupLists_id` PRIMARY KEY(`id`)
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
CREATE TABLE `sberbankPickupSchedule` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dayOfWeek` int NOT NULL,
	`pointId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sberbankPickupSchedule_id` PRIMARY KEY(`id`)
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
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nutsTariff` decimal(10,2) DEFAULT '0',
	`cedroilTariff` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
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
	`status` enum('assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'assigned',
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
