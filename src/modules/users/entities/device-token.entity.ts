import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
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

  @ManyToOne(() => UserEntity, (user) => user.deviceTokens, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;
}
