import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('referrals')
@Unique(['code'])
export class ReferralEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @ManyToOne(() => UserEntity, (user) => user.referrals)
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => UserEntity)
  usedBy: UserEntity;
}
