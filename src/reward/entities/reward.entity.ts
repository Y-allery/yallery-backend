import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RewardTypeEnum } from '../types/reward-type.enum';

@Entity('rewards')
export class RewardEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, name: 'reward_type' })
  @Index()
  rewardType: RewardTypeEnum;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // NOTE: Database column is `is_active` (snake_case), mapped to `isActive` property (camelCase).
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_daily' })
  isDaily: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
