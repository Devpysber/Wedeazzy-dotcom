-- Admin bulk email broadcast history (Send Emails admin panel feature).
-- Additive only: creates the table if missing, safe to re-run.

CREATE TABLE IF NOT EXISTS `email_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `segment` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `total_recipients` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `email_campaigns_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
