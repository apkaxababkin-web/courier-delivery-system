ALTER TABLE `couriers` ADD `urgencyThresholdOrange` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `couriers` ADD `urgencyThresholdRed` int DEFAULT 30 NOT NULL;