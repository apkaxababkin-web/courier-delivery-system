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
