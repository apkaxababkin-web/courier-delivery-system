CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nutsTariff` decimal(10,2) DEFAULT '0',
	`cedroilTariff` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
