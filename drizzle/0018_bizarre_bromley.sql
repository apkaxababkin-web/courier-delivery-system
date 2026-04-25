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
