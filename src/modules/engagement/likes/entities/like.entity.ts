import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';

// One like per (user, post). Enforced in the DB by migration
// AddUniqueLikeIndex1782001000000 (IDX_likes_user_post); declared here for
// schema parity (synchronize is off, so this decorator is documentation only).
@Entity('likes')
@Unique(['user', 'post'])
export class LikeEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.likes, { onDelete: 'CASCADE' })
  user: UserEntity;

  @ManyToOne(() => PostEntity, (post) => post.likes, { onDelete: 'CASCADE' })
  post: PostEntity;
}
