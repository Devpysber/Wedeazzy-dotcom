-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('admin', 'vendor', 'couple') NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `verifiedAt` DATETIME(3) NULL,
    `google_id` VARCHAR(191) NULL,
    `auth_provider` VARCHAR(191) NOT NULL DEFAULT 'local',
    `revoked_before` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `image_url` VARCHAR(191) NULL,
    `last_login` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_phone_key`(`phone`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_google_id_key`(`google_id`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Session_token_key`(`token`),
    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpCode` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpCode_phone_createdAt_idx`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClaimAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `ok` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClaimAttempt_vendorId_createdAt_idx`(`vendorId`, `createdAt`),
    INDEX `ClaimAttempt_ip_createdAt_idx`(`ip`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClaimRequest` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `claimantName` VARCHAR(191) NOT NULL,
    `claimantEmail` VARCHAR(191) NOT NULL,
    `claimantPhone` VARCHAR(191) NULL,
    `proofUrl` VARCHAR(500) NULL,
    `proofNotes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `adminNotes` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClaimRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ClaimRequest_vendorId_idx`(`vendorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vendor` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `legacyId` VARCHAR(191) NULL,
    `businessName` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `categorySlug` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `citySlug` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'India',
    `countryCode` VARCHAR(191) NOT NULL DEFAULT 'IN',
    `area` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `pincode` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `googleCid` VARCHAR(191) NULL,
    `whatsappNumber` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `priceMin` INTEGER NULL,
    `priceMax` INTEGER NULL,
    `capacity` INTEGER NULL,
    `services` JSON NULL,
    `alternateMobile` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `instagram` VARCHAR(191) NULL,
    `facebook` VARCHAR(191) NULL,
    `youtube` VARCHAR(191) NULL,
    `businessTimings` TEXT NULL,
    `yearsExperience` INTEGER NULL,
    `teamSize` INTEGER NULL,
    `serviceAreas` VARCHAR(191) NULL,
    `languagesSpoken` VARCHAR(191) NULL,
    `acceptsDestination` BOOLEAN NOT NULL DEFAULT false,
    `googleBusiness` VARCHAR(191) NULL,
    `kycDocumentUrl` VARCHAR(191) NULL,
    `rating` DOUBLE NOT NULL DEFAULT 4.5,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `tier` ENUM('basic', 'featured') NOT NULL DEFAULT 'basic',
    `featuredUntil` DATETIME(3) NULL,
    `subscriptionPlan` VARCHAR(191) NOT NULL DEFAULT 'Free',
    `subscriptionStart` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subscriptionExpiry` DATETIME(3) NULL,
    `razorpayOrderId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `isProfileComplete` BOOLEAN NOT NULL DEFAULT false,
    `invitedAt` DATETIME(3) NULL,
    `invitedChannel` VARCHAR(191) NULL,
    `country_id` VARCHAR(191) NULL,
    `city_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vendor_legacyId_key`(`legacyId`),
    UNIQUE INDEX `Vendor_slug_key`(`slug`),
    INDEX `Vendor_categorySlug_citySlug_idx`(`categorySlug`, `citySlug`),
    INDEX `Vendor_pincode_categorySlug_idx`(`pincode`, `categorySlug`),
    INDEX `Vendor_tier_idx`(`tier`),
    INDEX `Vendor_userId_idx`(`userId`),
    INDEX `Vendor_country_categorySlug_idx`(`country`, `categorySlug`),
    INDEX `Vendor_country_id_idx`(`country_id`),
    INDEX `Vendor_city_id_idx`(`city_id`),
    INDEX `Vendor_region_id_idx`(`region_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VendorPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isCover` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VendorPhoto_vendorId_position_idx`(`vendorId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PincodeLock` (
    `pincode` VARCHAR(191) NOT NULL,
    `categorySlug` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `lockedUntil` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PincodeLock_vendorId_key`(`vendorId`),
    PRIMARY KEY (`pincode`, `categorySlug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Couple` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `partnerName` VARCHAR(191) NULL,
    `weddingDate` DATETIME(3) NULL,
    `city` VARCHAR(191) NULL,
    `citySlug` VARCHAR(191) NULL,
    `budgetMin` INTEGER NULL,
    `budgetMax` INTEGER NULL,
    `guestCount` INTEGER NULL,
    `vibe` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Couple_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shortlist` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `status` ENUM('new', 'contacted', 'quoted', 'booked', 'closed', 'lost') NOT NULL DEFAULT 'new',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Shortlist_coupleId_vendorId_key`(`coupleId`, `vendorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanTask` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `dueDate` DATETIME(3) NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `remindAt` DATETIME(3) NULL,
    `remindedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlanTask_coupleId_dueDate_idx`(`coupleId`, `dueDate`),
    INDEX `PlanTask_remindAt_idx`(`remindAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Guest` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `rsvp` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `category` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Guest_coupleId_idx`(`coupleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inquiry` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `coupleUserId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `eventDate` DATETIME(3) NULL,
    `guests` VARCHAR(191) NULL,
    `budget` VARCHAR(191) NULL,
    `callDiscussion` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `status` ENUM('new', 'contacted', 'quoted', 'booked', 'closed', 'lost') NOT NULL DEFAULT 'new',
    `forwardedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Inquiry_vendorId_status_createdAt_idx`(`vendorId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `eventDate` DATETIME(3) NOT NULL,
    `amount` INTEGER NULL,
    `status` ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `gateway` VARCHAR(191) NOT NULL DEFAULT 'razorpay',
    `gatewayRef` VARCHAR(191) NULL,
    `status` ENUM('initiated', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'initiated',
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Transaction_gatewayRef_key`(`gatewayRef`),
    INDEX `Transaction_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `dailyBudget` INTEGER NOT NULL,
    `durationDays` INTEGER NOT NULL,
    `goal` VARCHAR(191) NOT NULL DEFAULT 'leads',
    `targetCity` VARCHAR(191) NULL,
    `targetAudience` TEXT NULL,
    `creativeCopy` TEXT NULL,
    `status` ENUM('draft', 'pending_review', 'active', 'paused', 'completed') NOT NULL DEFAULT 'draft',
    `packageType` VARCHAR(191) NULL,
    `planDays` INTEGER NULL,
    `totalAmount` INTEGER NULL,
    `gstAmount` INTEGER NULL,
    `baseAmount` INTEGER NULL,
    `gender` VARCHAR(191) NULL DEFAULT 'all',
    `targetAreas` JSON NULL,
    `ageMin` INTEGER NULL DEFAULT 18,
    `ageMax` INTEGER NULL DEFAULT 65,
    `timeSchedule` VARCHAR(191) NULL DEFAULT 'whole_day',
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `paymentRef` VARCHAR(191) NULL,
    `adminStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `adminNotes` TEXT NULL,
    `analyticsReach` INTEGER NOT NULL DEFAULT 0,
    `analyticsImpressions` INTEGER NOT NULL DEFAULT 0,
    `analyticsClicks` INTEGER NOT NULL DEFAULT 0,
    `analyticsLeads` INTEGER NOT NULL DEFAULT 0,
    `analyticsWhatsapp` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AdCampaign_vendorId_adminStatus_idx`(`vendorId`, `adminStatus`),
    INDEX `AdCampaign_adminStatus_createdAt_idx`(`adminStatus`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaMessage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `to` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `template` VARCHAR(191) NULL,
    `campaignName` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `error` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `nextRetryAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WaMessage_to_createdAt_idx`(`to`, `createdAt`),
    INDEX `WaMessage_status_nextRetryAt_idx`(`status`, `nextRetryAt`),
    INDEX `WaMessage_campaignName_idx`(`campaignName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_otps` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `otp` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_otps_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `used` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_key`(`token`),
    INDEX `password_reset_tokens_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jwt_denylist` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `jwt_denylist_token_key`(`token`),
    INDEX `jwt_denylist_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnalyticsEvent_vendorId_eventType_createdAt_idx`(`vendorId`, `eventType`, `createdAt`),
    INDEX `AnalyticsEvent_campaignId_eventType_createdAt_idx`(`campaignId`, `eventType`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `inquiryId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `rating` DOUBLE NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Review_inquiryId_key`(`inquiryId`),
    INDEX `Review_vendorId_createdAt_idx`(`vendorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `segment` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `preview_text` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `audience_rules` TEXT NULL,
    `custom_emails` TEXT NULL,
    `failed_recipients` TEXT NULL,
    `total_recipients` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `delivered_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `scheduled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `email_campaigns_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `preview_text` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `category` VARCHAR(191) NULL DEFAULT 'general',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blogs` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `meta_description` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `views` INTEGER NOT NULL DEFAULT 0,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `blogs_slug_key`(`slug`),
    INDEX `blogs_status_published_at_idx`(`status`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_histories` (
    `id` VARCHAR(191) NOT NULL,
    `import_batch_id` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NULL DEFAULT 'CSV/XLSX Importer',
    `total_rows` INTEGER NOT NULL,
    `imported_count` INTEGER NOT NULL,
    `updated_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `column_map` JSON NULL,
    `error_log` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `import_histories_import_batch_id_key`(`import_batch_id`),
    INDEX `import_histories_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_mapping_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `headers` JSON NOT NULL,
    `column_map` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `import_mapping_preferences_fingerprint_key`(`fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `countries` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `isoAlpha3` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `currencySymbol` VARCHAR(191) NOT NULL DEFAULT '₹',
    `phoneCode` VARCHAR(191) NOT NULL DEFAULT '+91',
    `flag` VARCHAR(191) NOT NULL DEFAULT '🇮🇳',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata',
    `default_language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `readiness_score` INTEGER NOT NULL DEFAULT 100,
    `is_marketplace_enabled` BOOLEAN NOT NULL DEFAULT true,
    `is_vendor_onboarding_enabled` BOOLEAN NOT NULL DEFAULT true,
    `is_couple_enquiries_enabled` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `countries_name_key`(`name`),
    UNIQUE INDEX `countries_slug_key`(`slug`),
    UNIQUE INDEX `countries_code_key`(`code`),
    INDEX `countries_status_displayOrder_idx`(`status`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cities` (
    `id` VARCHAR(191) NOT NULL,
    `country_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `image` VARCHAR(500) NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cities_slug_key`(`slug`),
    INDEX `cities_country_id_status_idx`(`country_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regions` (
    `id` VARCHAR(191) NOT NULL,
    `country_id` VARCHAR(191) NULL,
    `city_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `regions_country_id_status_idx`(`country_id`, `status`),
    INDEX `regions_city_id_status_idx`(`city_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_city_id_fkey` FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VendorPhoto` ADD CONSTRAINT `VendorPhoto_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PincodeLock` ADD CONSTRAINT `PincodeLock_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Couple` ADD CONSTRAINT `Couple_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shortlist` ADD CONSTRAINT `Shortlist_coupleId_fkey` FOREIGN KEY (`coupleId`) REFERENCES `Couple`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanTask` ADD CONSTRAINT `PlanTask_coupleId_fkey` FOREIGN KEY (`coupleId`) REFERENCES `Couple`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Guest` ADD CONSTRAINT `Guest_coupleId_fkey` FOREIGN KEY (`coupleId`) REFERENCES `Couple`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_coupleUserId_fkey` FOREIGN KEY (`coupleUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_coupleId_fkey` FOREIGN KEY (`coupleId`) REFERENCES `Couple`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdCampaign` ADD CONSTRAINT `AdCampaign_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WaMessage` ADD CONSTRAINT `WaMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_inquiryId_fkey` FOREIGN KEY (`inquiryId`) REFERENCES `Inquiry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cities` ADD CONSTRAINT `cities_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_city_id_fkey` FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

