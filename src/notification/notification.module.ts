import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { DatabaseModule } from 'src/database/database.module';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferenceEntity } from './entity/notification.preferences.entity';
import { UserModule } from 'src/user/user.module';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { MediaGenerationDeliveryEntity } from 'src/media-generation/entities/media-generation-delivery.entity';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      NotificationPreferenceEntity,
      PostEntity,
      TagEntity,
      MediaGenerationDeliveryEntity,
    ]),
    forwardRef(() => UserModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, JwtService],
  exports: [NotificationGateway],
})
export class NotificationModule {}
