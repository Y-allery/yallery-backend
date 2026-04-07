import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UserController } from './user.controller';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { UploadModule } from 'src/upload/upload.module';
import { ReferralEntity } from './entities/user-refferals.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { LikeEntity } from 'src/like/entities/like.entity';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnershipEntity } from 'src/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { ReportPostEntity } from 'src/post/entities/report.post.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';
import { RewardModule } from 'src/reward/reward.module';
import { UserActivityModule } from 'src/user-activity/user-activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      TagEntity,
      DeviceTokenEntity,
      ReferralEntity,
      PostEntity,
      LikeEntity,
      PartnershipActivityEntity,
      PartnershipEntity,
      PartnerUserLinkEntity,
      ReportPostEntity,
      PaymentEntity,
    ]),
    forwardRef(() => NotificationModule),
    UploadModule,
    FirebaseModule,
    RewardModule,
    UserActivityModule,
  ],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
