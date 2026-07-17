-- =============================================================================
-- WedEazzy: Add all missing columns and tables
-- Root cause of HTTP 500 on /api/auth/signup:
--   The Prisma schema was extended after the initial migration but no new
--   migration was ever created, so production DB is missing these columns/tables.
--
-- Compatible with MySQL 5.7+ and MySQL 8.x
-- Applied by: npx prisma migrate deploy
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. User table: make phone nullable & add all missing columns
-- ---------------------------------------------------------------------------
-- phone was NOT NULL in init migration, but the schema marks it optional
-- (email-only users in passwordless flow have no phone)
ALTER TABLE `User`
  MODIFY COLUMN `phone` VARCHAR(191) NULL;

-- Add all columns that were added to schema.prisma but never migrated
ALTER TABLE `User`
  ADD COLUMN `passwordHash`   VARCHAR(191) NULL,
  ADD COLUMN `googleId`       VARCHAR(191) NULL,
  ADD COLUMN `auth_provider`  VARCHAR(191) NOT NULL DEFAULT 'local',
  ADD COLUMN `revoked_before` DATETIME(3) NULL,
  ADD COLUMN `suspended_at`   DATETIME(3) NULL,
  ADD COLUMN `image_url`      VARCHAR(191) NULL,
  ADD COLUMN `last_login`     DATETIME(3) NULL;

-- Add missing unique indexes on User
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);
CREATE UNIQUE INDEX `User_googleId_key` ON `User`(`googleId`);

-- ---------------------------------------------------------------------------
-- 2. Vendor table: add new subscription / payment columns
-- ---------------------------------------------------------------------------
ALTER TABLE `Vendor`
  ADD COLUMN `subscriptionPlan`   VARCHAR(191) NOT NULL DEFAULT 'Basic',
  ADD COLUMN `subscriptionStart`  DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `subscriptionExpiry` DATETIME(3) NULL,
  ADD COLUMN `razorpayOrderId`    VARCHAR(191) NULL;

-- ---------------------------------------------------------------------------
-- 3. AdCampaign table: add all missing columns (initial migration was outdated)
-- ---------------------------------------------------------------------------
ALTER TABLE `AdCampaign`
  ADD COLUMN `goal`                  VARCHAR(191) NOT NULL DEFAULT 'leads',
  ADD COLUMN `targetCity`            VARCHAR(191) NULL,
  ADD COLUMN `targetAudience`        TEXT NULL,
  ADD COLUMN `packageType`           VARCHAR(191) NULL,
  ADD COLUMN `planDays`              INTEGER NULL,
  ADD COLUMN `totalAmount`           INTEGER NULL,
  ADD COLUMN `gstAmount`             INTEGER NULL,
  ADD COLUMN `baseAmount`            INTEGER NULL,
  ADD COLUMN `gender`                VARCHAR(191) NULL DEFAULT 'all',
  ADD COLUMN `targetAreas`           JSON NULL,
  ADD COLUMN `ageMin`                INTEGER NULL DEFAULT 18,
  ADD COLUMN `ageMax`                INTEGER NULL DEFAULT 65,
  ADD COLUMN `timeSchedule`          VARCHAR(191) NULL DEFAULT 'whole_day',
  ADD COLUMN `startTime`             VARCHAR(191) NULL,
  ADD COLUMN `endTime`               VARCHAR(191) NULL,
  ADD COLUMN `paymentMethod`         VARCHAR(191) NULL,
  ADD COLUMN `paymentStatus`         VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `paymentRef`            VARCHAR(191) NULL,
  ADD COLUMN `adminStatus`           VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `adminNotes`            TEXT NULL,
  ADD COLUMN `analyticsReach`        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `analyticsImpressions`  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `analyticsClicks`       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `analyticsLeads`        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `analyticsWhatsapp`     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `updatedAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- AdCampaign foreign key (missing from init)
-- ALTER TABLE `AdCampaign`
--   ADD CONSTRAINT `AdCampaign_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AdCampaign indexes
CREATE INDEX `AdCampaign_vendorId_adminStatus_idx` ON `AdCampaign`(`vendorId`, `adminStatus`);
CREATE INDEX `AdCampaign_adminStatus_createdAt_idx` ON `AdCampaign`(`adminStatus`, `createdAt`);

-- ---------------------------------------------------------------------------
-- 4. WaMessage table: add missing columns for retry engine
-- ---------------------------------------------------------------------------
ALTER TABLE `WaMessage`
  ADD COLUMN `retryCount`  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `nextRetryAt` DATETIME(3) NULL;

-- Add missing index for retry sweep query
CREATE INDEX `WaMessage_status_nextRetryAt_idx` ON `WaMessage`(`status`, `nextRetryAt`);

-- ---------------------------------------------------------------------------
-- 5. NEW TABLE: user_otps (for passwordless OTP login flow)
--    Required by: checkUser(), registerAndSendOtp(), verifyOtpLogin()
-- ---------------------------------------------------------------------------
CREATE TABLE `user_otps` (
  `id`         VARCHAR(191) NOT NULL,
  `email`      VARCHAR(191) NOT NULL,
  `otp`        VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `user_otps_email_idx`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. NEW TABLE: password_reset_tokens (for cryptographic password reset)
--    Required by: forgotPasswordSecure(), resetPasswordSecure()
-- ---------------------------------------------------------------------------
CREATE TABLE `password_reset_tokens` (
  `id`         VARCHAR(191) NOT NULL,
  `email`      VARCHAR(191) NOT NULL,
  `token`      VARCHAR(191) NOT NULL,
  `used`       INTEGER NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `password_reset_tokens_token_key`(`token`),
  INDEX `password_reset_tokens_token_idx`(`token`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. NEW TABLE: jwt_denylist (for secure logout / token revocation)
--    Required by: logout() in auth.controller.js
-- ---------------------------------------------------------------------------
CREATE TABLE `jwt_denylist` (
  `id`         VARCHAR(191) NOT NULL,
  `token`      VARCHAR(500) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `jwt_denylist_token_key`(`token`(191)),
  INDEX `jwt_denylist_token_idx`(`token`(191)),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. NEW TABLE: AnalyticsEvent (vendor profile/campaign analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE `AnalyticsEvent` (
  `id`         VARCHAR(191) NOT NULL,
  `vendorId`   VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NULL,
  `eventType`  VARCHAR(191) NOT NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AnalyticsEvent_vendorId_eventType_createdAt_idx`(`vendorId`, `eventType`, `createdAt`),
  INDEX `AnalyticsEvent_campaignId_eventType_createdAt_idx`(`campaignId`, `eventType`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
