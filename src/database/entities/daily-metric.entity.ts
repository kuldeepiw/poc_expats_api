import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** user_id set = per-user counters for rate limiting.
 *  user_id null = system-wide daily roll-up for the dashboard. */
@Entity('daily_metrics')
@Index(['user_id', 'date'], { unique: true })
export class DailyMetric {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'date' }) date: string;
  @Column({ type: 'varchar', nullable: true }) user_id: string | null;

  @Column({ type: 'int', default: 0 }) questions_asked: number;
  @Column({ type: 'int', default: 0 }) files_uploaded: number;
  @Column({ type: 'bigint', default: 0 }) tokens_used: string;
  @Column({ type: 'numeric', precision: 10, scale: 4, default: 0 }) cost_usd: string;
  @Column({ type: 'int', default: 0 }) cache_hits: number;
  @Column({ type: 'int', default: 0 }) unanswered_count: number;
}
