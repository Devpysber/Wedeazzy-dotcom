-- Guest plan purchases from the public /grow page.
-- IF NOT EXISTS so this is a no-op on databases already synced by
-- `db push` (see src/scripts/db-repair.js).
CREATE TABLE IF NOT EXISTS `GuestOrder` (
    `id` VARCHAR(191) NOT NULL,
    `razorpayOrderId` VARCHAR(191) NOT NULL,
    `razorpayPaymentId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'created',
    `planType` VARCHAR(191) NOT NULL,
    `planKey` VARCHAR(191) NOT NULL,
    `planLabel` VARCHAR(191) NOT NULL,
    `planDays` INTEGER NULL,
    `countryCode` VARCHAR(191) NOT NULL DEFAULT 'IN',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `amount` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `matchedVendorId` VARCHAR(191) NULL,
    `listingState` VARCHAR(191) NULL,
    `emailSentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuestOrder_razorpayOrderId_key`(`razorpayOrderId`),
    UNIQUE INDEX `GuestOrder_razorpayPaymentId_key`(`razorpayPaymentId`),
    INDEX `GuestOrder_email_idx`(`email`),
    INDEX `GuestOrder_phone_idx`(`phone`),
    INDEX `GuestOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
