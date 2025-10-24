import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { UserEntity } from './../../user/entities/user.entity';
import { PostEntity } from './post.entity';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';

@Entity('reports')
export class ReportPostEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.id)
  reportingUser: UserEntity;

  @ManyToOne(() => UserEntity, (user) => user.id)
  reportedUser: UserEntity;

  @ManyToOne(() => PostEntity, (post) => post.id, { onDelete: 'CASCADE' })
  post: PostEntity;

  @Column({ type: 'text' })
  description: string;
}
