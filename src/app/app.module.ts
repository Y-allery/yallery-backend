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
import { APP_FILTER } from '@nestjs/core';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { MemeModule } from 'src/modules/memes/meme.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { ProviderSettingsModule } from 'src/modules/provider-settings/provider-settings.module';

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
      }),
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
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
    MemeModule,
    UserActivityModule,
    ProviderSettingsModule,
    MediaGenerationModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
