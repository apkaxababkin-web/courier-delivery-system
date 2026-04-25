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
