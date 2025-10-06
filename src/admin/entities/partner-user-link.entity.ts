import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PartnershipEntity } from './partner.entity';
import { UserEntity } from 'src/user/entities/user.entity';

@Entity('partner_user_links')
@Index(['partnershipId', 'partnerUserId'], { unique: true })
export class PartnerUserLinkEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  partnershipId: number;

  @ManyToOne(() => PartnershipEntity)
  @JoinColumn({ name: 'partnershipId' })
  partnership: PartnershipEntity;

  @Column({ type: 'varchar', length: 255 })
  partnerUserId: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: UserEntity | null;

  @CreateDateColumn()
  createdAt: Date;
}


