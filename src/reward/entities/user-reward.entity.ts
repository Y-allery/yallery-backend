import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { RewardTypeEnum } from '../types/reward-type.enum';

@Entity('user_rewards')
@Index(['userId', 'rewardType', 'eligibleDate'], { unique: true })
export class UserRewardEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  user: UserEntity;

  @Column({ type: 'varchar' })
  @Index()
  rewardType: RewardTypeEnum;

  @Column({ type: 'date' })
  @Index()
  eligibleDate: Date;

  @Column({ type: 'date', nullable: true })
  claimedDate: Date | null;

  @Column({ type: 'int', nullable: true })
  pointsAwarded: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
