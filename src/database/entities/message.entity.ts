import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Conversation } from './conversation.entity';
import { MessageSource } from './message-source.entity';

@Entity('messages')
@Index(['conversation_id', 'created_at'])
export class Message {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;
  @Column() conversation_id: string;

  @Column({ type: 'varchar' }) role: 'user' | 'assistant';
  @Column({ type: 'text' }) content: string;

  /** The structured answer, with a source recorded against every fact. */
  @Column({ type: 'jsonb', nullable: true })
  content_structured: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  confidence: 'high' | 'medium' | 'none' | null;

  /** Model, tokens, cost, latency, cache hit. Read-only diagnostics —
   *  never filtered on, which is why it is JSONB. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @OneToMany(() => MessageSource, (s) => s.message) sources: MessageSource[];

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
