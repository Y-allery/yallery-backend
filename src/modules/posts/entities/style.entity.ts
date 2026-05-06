import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('styles')
export class StyleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, default: 'anime' })
  slug: string;

  @Column()
  imageUrl: string;
}
