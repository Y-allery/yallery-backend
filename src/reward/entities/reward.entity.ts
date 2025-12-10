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

  @Column({ type: 'varchar', unique: true })
  @Index()
  reward_type: RewardTypeEnum;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  // Позначаємо чи нагорода є щоденною (claimable раз на день)
  @Column({ type: 'boolean', default: false })
  is_daily: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
