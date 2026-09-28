import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Message } from './message.entity';

@Entity('conversations')
@Index(['user_id', 'last_message_at'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() user_id: string;
  @Column({ type: 'varchar', nullable: true }) title: string | null;

  /** Set when the user picks a process, or when classification detects one
   *  with confidence. Follow-up turns then inherit it. */
  @Column({ type: 'varchar', nullable: true }) process_key: string | null;

  /** What the user has already told us in this thread, so we never ask twice. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  collected_context: Record<string, unknown>;

  @Column({ type: 'int', default: 0 }) message_count: number;
  @Column({ default: false }) is_archived: boolean;
  @Column({ type: 'timestamptz', nullable: true }) last_message_at: Date | null;

  @OneToMany(() => Message, (m) => m.conversation) messages: Message[];

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deleted_at: Date | null;
}
