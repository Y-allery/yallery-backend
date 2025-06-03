import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { UserEntity } from './../../user/entities/user.entity';
import { PostEntity } from '../../post/entities/post.entity';
import { TagEntity } from '../../tag/entities/tag.entity';
import {
  ContestStatusEnum,
  ContestTypeEnum,
} from '../types/contest.status.enum';
import { ActivityEntity } from '../../activity/entities/activity.entity';

@Entity('contests')
export class ContestEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  imageUrl: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  fineTuneToken: string;

  @Column({ nullable: true })
  fineTuneTriggerWord: string;

  @Column({ nullable: true, default: 1 })
  fineTuneStrength: number;

  @Column({
    type: 'enum',
    enum: ContestTypeEnum,
    default: ContestTypeEnum.DEFAULT,
  })
  contestType: ContestTypeEnum;

  @Column({
    type: 'enum',
    enum: ContestStatusEnum,
    default: ContestStatusEnum.CLOSED,
  })
  status: ContestStatusEnum;

  @Column({ nullable: true })
  reward: number;

  @Column({ type: 'boolean', default: false })
  is_approved: boolean;

  @ManyToMany(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinTable()
  participants: UserEntity[];

  @OneToMany(() => PostEntity, (post) => post.contest, { onDelete: 'CASCADE' })
  posts: PostEntity[];

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  winner: UserEntity;

  @Column('timestamp', { name: 'start_time' })
  startTime: Date;

  @Column('timestamp', { name: 'end_time' })
  endTime: Date;

  @ManyToOne(() => TagEntity, (tag) => tag.contests, {
    nullable: true,
    onDelete: 'NO ACTION',
  })
  tag: TagEntity;

  @OneToMany(() => ActivityEntity, (activity) => activity.contest, {
    onDelete: 'CASCADE',
  })
  activities: ActivityEntity[];

  @Column({ type: 'text', nullable: true })
  prompt_example: string;

  @ManyToOne(() => PostEntity, (post) => post.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  postWinner: PostEntity;
}
