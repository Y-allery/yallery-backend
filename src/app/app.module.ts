import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/core/database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from 'src/core/config/env.validation';
import { UserModule } from 'src/modules/users/user.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { MailModule } from 'src/integrations/mail/mail.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TagModule } from 'src/modules/catalog/tags/tag.module';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { PostModule } from 'src/modules/posts/post.module';
import { LikeModule } from 'src/modules/engagement/likes/like.module';
import { ContestModule } from 'src/modules/contests/contest.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { FirebaseModule } from 'src/integrations/firebase/firebase.module';
import { TransactionModule } from 'src/modules/billing/transactions/transaction.module';
import { AdminModule } from 'src/modules/admin/admin.module';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { PaymentModule } from 'src/modules/billing/payments/payment.module';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { areDevToolsEnabled } from 'src/core/config/environment';
import { buildThrottlerOptions } from 'src/core/config/throttler.config';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { EconomyModule } from 'src/modules/billing/economy/economy.module';
import { MemeModule } from 'src/modules/memes/meme.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { MediaProxyModule } from 'src/modules/media-proxy/media-proxy.module';
import { ProviderSettingsModule } from 'src/modules/provider-settings/provider-settings.module';
import { TranslationsModule } from 'src/modules/translations/translations.module';
import { ContentBotModule } from 'src/modules/content-bot/content-bot.module';
import { OpsBotModule } from 'src/modules/ops-bot/ops-bot.module';
import { PartnerApiModule } from 'src/modules/partner-api/partner-api.module';
import { PartnerApiAdminModule } from 'src/modules/partner-api/partner-api-admin.module';
import { WorkerKeepaliveModule } from 'src/modules/worker-keepalive/worker-keepalive.module';

/**
 * The @Module decorator below is evaluated while this file is imported — before
 * Nest boots and therefore before ConfigModule copies .env into process.env. On
 * the servers NODE_ENV lives in .env, so without this call the production gate
 * would read `undefined` and quietly mount dev tooling in production. Loading
 * twice is harmless: ConfigModule never overwrites variables that the real
 * process environment already defines.
 */
void ConfigModule.forRoot();

const DEV_TOOLS_ENABLED = areDevToolsEnabled();

@Module({
  imports: [
    SentryModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
        streams: {
          events: {
            maxLen: 1000,
          },
        },
      }),
    }),
    // Unauthenticated queue dashboard (inspect, retry and delete jobs) — dev
    // tooling only, so it must not exist as a route in production.
    ...(DEV_TOOLS_ENABLED
      ? [
          BullBoardModule.forRoot({
            route: '/queues',
            adapter: ExpressAdapter,
          }),
        ]
      : []),
    ThrottlerModule.forRoot(buildThrottlerOptions()),
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'public'),
      exclude: ['/api*', '/upload*'],
      serveRoot: '/',
    }),
    DatabaseModule,
    UserModule,
    AuthModule,
    MailModule,
    TagModule,
    UploadModule,
    PostModule,
    LikeModule,
    ContestModule,
    ScheduleModule.forRoot(),
    NotificationModule,
    FirebaseModule,
    TransactionModule,
    AdminModule,
    PaymentModule,
    RewardModule,
    EconomyModule,
    MemeModule,
    UserActivityModule,
    ProviderSettingsModule,
    MediaGenerationModule,
    MediaProxyModule,
    TranslationsModule,
    ContentBotModule,
    OpsBotModule,
    PartnerApiModule,
    PartnerApiAdminModule,
    WorkerKeepaliveModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
