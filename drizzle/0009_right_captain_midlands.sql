ALTER TABLE `couriers` ADD `preferredNavigator` enum('2gis','yandex') DEFAULT '2gis' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `senderPhone` varchar(20);--> statement-breakpoint
ALTER TABLE `tasks` ADD `comments` text;