import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1748956310064 implements MigrationInterface {
  name = 'Initial1748956310064';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "ai_service_tokens" (
            "id" int NOT NULL AUTO_INCREMENT,
            "ai_service" enum('aura_flow','flux','realistic_vision','flux_pro_fine_tune') NOT NULL,
            "token" text NOT NULL,
            "status" enum('active','rate_limited','inactive') NOT NULL DEFAULT 'active',
            "rate_limit_reset_time" timestamp NULL DEFAULT NULL,
            "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "colors" (
            "id" int NOT NULL AUTO_INCREMENT,
            "name" varchar(255) NOT NULL,
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "partnerships" (
            "id" int NOT NULL AUTO_INCREMENT,
            "partnerName" varchar(255) NOT NULL,
            "companyName" varchar(255) NOT NULL,
            "source" enum('mini app','regular app') NOT NULL,
            "referralLink" varchar(255) NOT NULL,
            "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "referralToken" varchar(255) NOT NULL,
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "partnership_activities" (
            "id" int NOT NULL AUTO_INCREMENT,
            "userId" int NOT NULL,
            "activity" varchar(255) NOT NULL,
            "partnershipId" int NOT NULL,
            "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "payments" (
            "id" int NOT NULL AUTO_INCREMENT,
            "paymentIntentId" varchar(255) DEFAULT NULL,
            "userId" int NOT NULL,
            "productId" varchar(255) NOT NULL,
            "amount" int NOT NULL,
            "currency" varchar(255) NOT NULL,
            "status" varchar(255) NOT NULL DEFAULT 'pending',
            "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY ("id"),
            UNIQUE KEY "IDX_a1267c27d37d0c87154be17d93" ("paymentIntentId")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "styles" (
            "id" int NOT NULL AUTO_INCREMENT,
            "name" varchar(100) NOT NULL,
            "imageUrl" varchar(255) NOT NULL,
            "slug" varchar(100) NOT NULL DEFAULT 'anime',
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "tags" (
            "id" int NOT NULL AUTO_INCREMENT,
            "name" varchar(255) NOT NULL,
            "imageUrl" varchar(255) NOT NULL,
            "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "users" (
            "id" int NOT NULL AUTO_INCREMENT,
            "name" varchar(255) NOT NULL,
            "nickname" varchar(255) DEFAULT NULL,
            "email" varchar(255) NOT NULL,
            "password" varchar(255) DEFAULT NULL,
            "refreshToken" varchar(255) DEFAULT NULL,
            "resetToken" varchar(255) DEFAULT NULL,
            "resetTokenExpiration" timestamp NULL DEFAULT NULL,
            "points" int NOT NULL DEFAULT '0',
            "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            "is_deleted" tinyint NOT NULL DEFAULT '0',
            "notificationsEnabled" tinyint NOT NULL DEFAULT '1',
            "avatar" varchar(255) DEFAULT NULL,
            "role" enum('admin','user') NOT NULL DEFAULT 'user',
            "telegramId" bigint unsigned DEFAULT NULL,
            "bonusEligible" tinyint NOT NULL DEFAULT '1',
            "emailVerified" tinyint NOT NULL DEFAULT '1',
            "verificationToken" varchar(255) DEFAULT NULL,
            "lastShareRewardAt" timestamp NULL DEFAULT NULL,
            "twitterCredentials" json DEFAULT NULL,
            "twitterUsername" varchar(255) DEFAULT NULL,
            PRIMARY KEY ("id"),
            UNIQUE KEY "IDX_ad02a1be8707004cb805a4b502" ("nickname"),
            UNIQUE KEY "IDX_df18d17f84763558ac84192c75" ("telegramId"),
            UNIQUE KEY "IDX_945333aaddfc5b9021b2ee94d5" ("verificationToken")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "contests" (
            "id" int NOT NULL AUTO_INCREMENT,
            "name" varchar(255) NOT NULL,
            "imageUrl" varchar(255) NOT NULL,
            "description" varchar(255) NOT NULL,
            "reward" int DEFAULT NULL,
            "start_time" timestamp NOT NULL,
            "end_time" timestamp NOT NULL,
            "winnerId" int DEFAULT NULL,
            "tagId" int DEFAULT NULL,
            "status" enum('closed','open','pending_review') NOT NULL DEFAULT 'closed',
            "is_approved" tinyint NOT NULL DEFAULT '0',
            "fineTuneToken" varchar(255) DEFAULT NULL,
            "contestType" enum('DEFAULT','FINE_TUNE') NOT NULL DEFAULT 'DEFAULT',
            "fineTuneStrength" int DEFAULT '1',
            "fineTuneTriggerWord" varchar(255) DEFAULT NULL,
            "prompt_example" text,
            "postWinnerId" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            KEY "FK_626cdf2b3e9c9e74e076e19c0a9" ("winnerId"),
            KEY "FK_d139428a7e7a97e2dd0fdda1b43" ("tagId"),
            CONSTRAINT "FK_626cdf2b3e9c9e74e076e19c0a9" FOREIGN KEY ("winnerId") REFERENCES "users" ("id") ON DELETE SET NULL,
            CONSTRAINT "FK_d139428a7e7a97e2dd0fdda1b43" FOREIGN KEY ("tagId") REFERENCES "tags" ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "posts" (
            "id" int NOT NULL AUTO_INCREMENT,
            "imageUrl" varchar(255) NOT NULL,
            "userId" int DEFAULT NULL,
            "tagId" int DEFAULT NULL,
            "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            "is_published" tinyint NOT NULL DEFAULT '0',
            "is_saved" tinyint NOT NULL DEFAULT '0',
            "contestId" int DEFAULT NULL,
            "is_blocked" tinyint NOT NULL DEFAULT '0',
            "is_rejected" tinyint NOT NULL DEFAULT '0',
            "is_delivered" tinyint NOT NULL DEFAULT '1',
            "hasWonDailyReward" tinyint NOT NULL DEFAULT '0',
            "tweetLink" varchar(255) DEFAULT NULL,
            PRIMARY KEY ("id"),
            KEY "IDX_6aff66070b52399639eeb3cc89" ("imageUrl"),
            KEY "IDX_ae05faaa55c866130abef6e1fe" ("userId"),
            KEY "IDX_122313e5405230bc430e38c12d" ("tagId"),
            KEY "IDX_9940eadb862fdda6a6a64a13a3" ("is_published"),
            KEY "IDX_e7a92e0b265b6521c8f77c2cf0" ("is_blocked"),
            KEY "IDX_2ba375b245d0e7a5f48688b904" ("contestId"),
            KEY "IDX_3ff3ff6ea134f3c785a32fb2fc" ("is_rejected"),
            CONSTRAINT "FK_122313e5405230bc430e38c12d1" FOREIGN KEY ("tagId") REFERENCES "tags" ("id"),
            CONSTRAINT "FK_ae05faaa55c866130abef6e1fee" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "contests_participants_users" (
            "contestsId" int NOT NULL,
            "usersId" int NOT NULL,
            PRIMARY KEY ("contestsId","usersId"),
            KEY "IDX_a2d3fd26863eada4a93d7bacbe" ("contestsId"),
            KEY "IDX_0ae6fdff1051c718f427d03367" ("usersId"),
            CONSTRAINT "FK_0ae6fdff1051c718f427d03367c" FOREIGN KEY ("usersId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "FK_a2d3fd26863eada4a93d7bacbe9" FOREIGN KEY ("contestsId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "users_tags_tags" (
            "usersId" int NOT NULL,
            "tagsId" int NOT NULL,
            PRIMARY KEY ("usersId","tagsId"),
            KEY "IDX_e36e86825bbc09e1fc9d3c83fb" ("usersId"),
            KEY "IDX_9de46fe02d9d7488f92bedf417" ("tagsId"),
            CONSTRAINT "FK_e36e86825bbc09e1fc9d3c83fb0" FOREIGN KEY ("usersId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "likes" (
            "id" int NOT NULL AUTO_INCREMENT,
            "userId" int DEFAULT NULL,
            "postId" int DEFAULT NULL,
            "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY ("id"),
            KEY "FK_likes_post" ("postId"),
            KEY "FK_likes_user" ("userId"),
            CONSTRAINT "FK_likes_post" FOREIGN KEY ("postId") REFERENCES "posts" ("id") ON DELETE CASCADE,
            CONSTRAINT "FK_likes_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "notification_preferences" (
            "id" int NOT NULL AUTO_INCREMENT,
            "activityType" enum('LIKE_EARN','LIKE_SPEND','IMAGE_GENERATE_SPEND','CONTEST_CLOSE','CONTEST_WIN','DAILY_REWARD','SHARE_REWARD','ADMIN_REPORT','ADMIN_CONTEST_REVIEW','ADMIN_REPORT_REVIEW','ADMIN_CONTEST_WON','TOP_POST_REWARD_AUTHOR','TOP_POST_REWARD_LIKER') NOT NULL,
            "enabled" tinyint NOT NULL DEFAULT '1',
            "userId" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            UNIQUE KEY "IDX_95bbd9bd237cdef751e39b1f6e" ("userId","activityType")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "user_device_tokens" (
            "id" int NOT NULL AUTO_INCREMENT,
            "token" varchar(255) NOT NULL,
            "deviceType" enum('iOS','Android','Web') NOT NULL,
            "userId" int DEFAULT NULL,
            PRIMARY KEY ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "referrals" (
            "id" int NOT NULL AUTO_INCREMENT,
            "code" varchar(255) NOT NULL,
            "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "isActive" tinyint NOT NULL DEFAULT '1',
            "userId" int DEFAULT NULL,
            "usedById" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            UNIQUE KEY "IDX_a53a83849f95cbcf3fbcf32fd0" ("code")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "reports" (
            "id" int NOT NULL AUTO_INCREMENT,
            "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            "description" text NOT NULL,
            "reportingUserId" int DEFAULT NULL,
            "reportedUserId" int DEFAULT NULL,
            "postId" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            KEY "FK_14b92bd5f2f538a73bcf781d298" ("reportingUserId"),
            KEY "FK_c88d2686339ad6d166620b741a6" ("reportedUserId"),
            KEY "FK_6bebfa3fc68a35f5af3f9883c4e" ("postId"),
            CONSTRAINT "FK_14b92bd5f2f538a73bcf781d298" FOREIGN KEY ("reportingUserId") REFERENCES "users" ("id"),
            CONSTRAINT "FK_6bebfa3fc68a35f5af3f9883c4e" FOREIGN KEY ("postId") REFERENCES "posts" ("id"),
            CONSTRAINT "FK_c88d2686339ad6d166620b741a6" FOREIGN KEY ("reportedUserId") REFERENCES "users" ("id")
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "viewed_posts" (
            "id" int NOT NULL AUTO_INCREMENT,
            "userId" int DEFAULT NULL,
            "postId" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            UNIQUE KEY "IDX_b5b9770dbeef762363777500c3" ("userId","postId"),
            CONSTRAINT "FK_a0e468af438154afdd372fd2bcb" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
          );
        `);

    await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "activity" (
            "id" int NOT NULL AUTO_INCREMENT,
            "activityType" enum('LIKE_EARN','LIKE_SPEND','IMAGE_GENERATE_SPEND','CONTEST_CLOSE','CONTEST_OPEN','CONTEST_WIN','DAILY_REWARD','SHARE_REWARD','ADMIN_REPORT','ADMIN_CONTEST_REVIEW','ADMIN_REPORT_REVIEW','ADMIN_CONTEST_WON','TOP_POST_REWARD_AUTHOR','TOP_POST_REWARD_LIKER') NOT NULL DEFAULT 'LIKE_EARN',
            "description" varchar(255) NOT NULL,
            "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            "from_user_id" int DEFAULT NULL,
            "to_user_id" int DEFAULT NULL,
            "points" int DEFAULT '0',
            "post_id" int DEFAULT NULL,
            "is_admin" tinyint NOT NULL DEFAULT '0',
            "isRead" tinyint NOT NULL DEFAULT '0',
            "contest_id" int DEFAULT NULL,
            PRIMARY KEY ("id"),
            KEY "FK_86544031c5cb89dea77b32cede1" ("from_user_id"),
            KEY "FK_e67eeb490f1a183c27d92d06dfe" ("to_user_id"),
            KEY "FK_624114671c34d2515ec04c2c88c" ("post_id"),
            KEY "FK_e592673989138da18babffdef7e" ("contest_id"),
            CONSTRAINT "FK_624114671c34d2515ec04c2c88c" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE,
            CONSTRAINT "FK_86544031c5cb89dea77b32cede1" FOREIGN KEY ("from_user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
            CONSTRAINT "FK_e592673989138da18babffdef7e" FOREIGN KEY ("contest_id") REFERENCES "contests" ("id") ON DELETE CASCADE,
            CONSTRAINT "FK_e67eeb490f1a183c27d92d06dfe" FOREIGN KEY ("to_user_id") REFERENCES "users" ("id") ON DELETE CASCADE
          );
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "activity";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "viewed_posts";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reports";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referrals";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_device_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "likes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users_tags_tags";`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "contests_participants_users";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "posts";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contests";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "styles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partnership_activities";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partnerships";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "colors";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_service_tokens";`);
  }
}
