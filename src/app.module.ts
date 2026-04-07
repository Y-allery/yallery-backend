import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.validation';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TagModule } from './tag/tag.module';
import { UploadModule } from './upload/upload.module';
import { PostModule } from './post/post.module';
import { LikeModule } from './like/like.module';
import { ContestModule } from './contest/contest.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from './notification/notification.module';
import { FirebaseModule } from './firebase/firebase.module';
import { TransactionModule } from './transaction/transaction.module';
import { AdminModule } from './admin/admin.module';
import { ServiceTokenModule } from './service-token/service-token.module';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { PaymentModule } from './payment/payment.module';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';
import { RewardModule } from './reward/reward.module';
import { MemeModule } from './meme/meme.module';
import { UserActivityModule } from './user-activity/user-activity.module';
import { MediaGenerationModule } from './media-generation/media-generation.module';

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
    ServiceTokenModule,
    PaymentModule,
    RewardModule,
    MemeModule,
    UserActivityModule,
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
