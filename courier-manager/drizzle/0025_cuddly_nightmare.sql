ALTER TABLE `requests` ADD `recipientAddress` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `senderCompany` varchar(255);--> statement-breakpoint
ALTER TABLE `requests` ADD `senderCity` varchar(100);--> statement-breakpoint
ALTER TABLE `requests` ADD `recipientCompany` varchar(255);--> statement-breakpoint
ALTER TABLE `requests` ADD `recipientCity` varchar(100);--> statement-breakpoint
ALTER TABLE `requests` ADD `comments` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `paymentMethod` enum('paid','transfer','cash','terminal','qr');--> statement-breakpoint
ALTER TABLE `requests` ADD `paymentAmount` decimal(10,2);