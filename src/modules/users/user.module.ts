import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UserController } from './user.controller';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { FirebaseModule } from 'src/integrations/firebase/firebase.module';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { ReferralEntity } from './entities/user-refferals.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { ReportPostEntity } from 'src/modules/posts/entities/report.post.entity';
import { PaymentEntity } from 'src/modules/billing/payments/entities/payment.entity';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';

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
