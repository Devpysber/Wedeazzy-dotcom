-- Couple <-> vendor chat: one Conversation per signed-in couple's enquiry.
-- IF NOT EXISTS (with the foreign keys inline) so this is a no-op on databases
-- already synced by `db push` (see src/scripts/db-repair.js).
CREATE TABLE IF NOT EXISTS `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `enquiryId` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Conversation_enquiryId_key`(`enquiryId`),
    INDEX `Conversation_coupleId_idx`(`coupleId`),
    INDEX `Conversation_vendorId_idx`(`vendorId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Conversation_enquiryId_fkey` FOREIGN KEY (`enquiryId`) REFERENCES `Inquiry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `Conversation_coupleId_fkey` FOREIGN KEY (`coupleId`) REFERENCES `Couple`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `Conversation_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `Message_conversationId_readAt_idx`(`conversationId`, `readAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
