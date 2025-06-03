import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PartnershipSource {
  MINI_APP = 'mini app',
  REGULAR_APP = 'regular app',
}

@Entity('partnerships')
export class PartnershipEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  partnerName: string;

  @Column()
  companyName: string;

  @Column({
    type: 'enum',
    enum: PartnershipSource,
  })
  source: PartnershipSource;

  @Column()
  referralToken: string;

  @Column()
  referralLink: string;

  @CreateDateColumn()
  createdAt: Date;
}
