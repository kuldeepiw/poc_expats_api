import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @Column() user_id: string;

  @Column({ default: 'editor' }) role: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) permissions: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @Column({ type: 'varchar', nullable: true }) created_by: string | null;
}
