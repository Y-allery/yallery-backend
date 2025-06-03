import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { UserEntity } from './../../user/entities/user.entity';
import { PostEntity } from '../../post/entities/post.entity';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';

@Entity('likes')
export class LikeEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.likes, { onDelete: 'CASCADE' })
  user: UserEntity;

  @ManyToOne(() => PostEntity, (post) => post.likes, { onDelete: 'CASCADE' })
  post: PostEntity;
}
