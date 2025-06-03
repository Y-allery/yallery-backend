import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PartnershipEntity } from './partner.entity';

@Entity('partnership_activities')
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
