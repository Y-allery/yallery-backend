import { Column, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('admin_metrics')
export class AdminMetricsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'datetime' })
  @Index()
  periodStart: Date;

  @Column({ type: 'datetime' })
  @Index()
  periodEnd: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  snapshotTime: Date;

  @Column({ type: 'int', default: 0 })
  newUsers: number;

  @Column({ type: 'int', default: 0 })
  totalUsers: number;

  @Column({ type: 'int', default: 0 })
  newPosts: number;

  @Column({ type: 'int', default: 0 })
  newImagePosts: number;

  @Column({ type: 'int', default: 0 })
  newVideoPosts: number;

  @Column({ type: 'int', default: 0 })
  totalPosts: number;

  @Column({ type: 'int', default: 0 })
  totalImagePosts: number;

  @Column({ type: 'int', default: 0 })
  totalVideoPosts: number;

  @Column({ type: 'int', default: 0 })
  activeUsers: number;

  @Column({ type: 'int', default: 0 })
  newLikes: number;

  @Column({ type: 'int', default: 0 })
  totalLikes: number;

  @Column({ type: 'int', default: 0 })
  newContestPosts: number;

  @Column({ type: 'int', default: 0 })
  newRegularPosts: number;

  @Column({ type: 'float', default: 0 })
  avgLikesPerPost: number;

  @Column({ type: 'json', nullable: true })
  aiStats: {
    image?: Record<
      string,
      {
        newPosts: number;
        totalPosts: number;
      }
    >;
    video?: Record<
      string,
      {
        newPosts: number;
        totalPosts: number;
      }
    >;
  } | null;

  @Column({ type: 'float', default: 0 })
  postsPerUserAvg7D: number;

  @Column({ type: 'json', nullable: true })
  topTags7D: {
    tagId: number;
    name: string;
    posts: number;
    likes: number;
  }[] | null;

  @Column({ type: 'int', default: 0 })
  purchasedYeps7D: number;

  @Column({ type: 'json', nullable: true })
  contestParticipantsStats: {
    contestId: number;
    contestName: string;
    participantsCount: number;
  }[] | null;
}


