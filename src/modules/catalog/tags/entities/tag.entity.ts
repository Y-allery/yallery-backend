import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';

@Entity('tags')
export class TagEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  imageUrl: string;

  @ManyToMany(() => UserEntity, (user) => user.tags, { onDelete: 'CASCADE' })
  users: UserEntity[];

  @OneToMany(() => PostEntity, (post) => post.tag, { onDelete: 'CASCADE' })
  posts: PostEntity[];

  @OneToMany(() => ContestEntity, (contest) => contest.tag, {
    onDelete: 'CASCADE',
  })
  contests: ContestEntity[];
}
