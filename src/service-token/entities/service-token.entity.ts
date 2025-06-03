import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AIEnum } from '../../common/enums/ai.enum';

export enum TokenStatus {
  ACTIVE = 'active',
  RATE_LIMITED = 'rate_limited',
  INACTIVE = 'inactive',
}

@Entity('ai_service_tokens')
export class AiServiceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: AIEnum,
  })
  ai_service: AIEnum;

  @Column({ type: 'text' })
  token: string;

  @Column({
    type: 'enum',
    enum: TokenStatus,
    default: TokenStatus.ACTIVE,
  })
  status: TokenStatus;

  @Column({ type: 'timestamp', nullable: true })
  rate_limit_reset_time: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
