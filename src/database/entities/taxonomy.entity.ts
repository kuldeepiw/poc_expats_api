import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Document categories and government processes share one table. A new
 *  category or process is an inserted row, never a new table. */
@Entity('taxonomy')
@Index(['type', 'key'], { unique: true })
export class Taxonomy {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar' }) type: 'category' | 'process' | 'state';
  @Column() key: string;
  @Column() name: string;
  @Column({ type: 'varchar', nullable: true }) description: string | null;
  @Column({ type: 'text', array: true, default: () => "'{}'" }) search_terms: string[];

  /** Process-specific settings, e.g. which user context is required. */
  @Column({ type: 'jsonb', default: () => "'{}'" }) config: Record<string, unknown>;

  @Column({ type: 'int', default: 0 }) display_order: number;
  @Column({ default: true }) is_active: boolean;
}
