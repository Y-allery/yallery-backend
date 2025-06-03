import { PostEntity } from '../../post/entities/post.entity';
import { UserEntity } from './../../user/entities/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { ContestEntity } from '../../contest/entity/contest.entity';

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
