import { Entity, PrimaryGeneratedColumn, ManyToOne, Unique } from 'typeorm';
import { PostEntity } from './post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';

@Entity('viewed_posts')
@Unique(['user', 'post'])
export class ViewedPostEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.viewedPosts, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;

  @ManyToOne(() => PostEntity, (post) => post.viewedBy, {
    onDelete: 'CASCADE',
  })
  post: PostEntity;
}
