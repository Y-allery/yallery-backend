import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { PartnershipEntity } from './partner.entity';

@Entity('partnership_activities')
// Created by migration 1784500000000; the INSERT IGNORE writes in
// PartnershipActivityLoggerService and ReferralFlagService depend on it to
// dedupe. Declared here for schema parity (synchronize is off, so this
// decorator is documentation only).
@Unique('IDX_pa_user_partnership_activity_uq', [
  'userId',
  'partnershipId',
  'activity',
])
export class PartnershipActivityEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  activity: string;

  @Column()
  partnershipId: number;

  @ManyToOne(() => PartnershipEntity)
  @JoinColumn({ name: 'partnershipId' })
  partnership: PartnershipEntity;

  @CreateDateColumn()
  createdAt: Date;
}
