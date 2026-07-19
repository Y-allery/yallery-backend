import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { DeviceType } from '../types/device.interface';

@Entity('user_device_tokens')
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  token: string;

  @Column({
    type: 'enum',
    enum: DeviceType,
  })
  deviceType: DeviceType;

  /**
   * Nullable because rows that predate migration 1784600000000 have no known
   * registration time — treat NULL as "registered before we tracked this",
   * not as a fresh token.
   */
  @CreateDateColumn({ type: 'timestamp', nullable: true })
  createdAt: Date | null;

  /** Bumped whenever the device re-registers, i.e. proof the token is live. */
  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.deviceTokens, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;
}
