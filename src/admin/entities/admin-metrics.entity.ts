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
}


