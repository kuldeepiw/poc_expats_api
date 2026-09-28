import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Message } from './message.entity';

/**
 * Which chunk produced which answer.
 *
 * A real table, not JSONB, because it gets queried: "how many answers came
 * from this document", "which document caused these complaints".
 *
 * The references are nullable and deliberately NOT cascaded from
 * document_chunks — the audit trail has to survive document deletion.
 */
@Entity('message_sources')
export class MessageSource {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Message, (m) => m.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: Message;
  @Column() message_id: string;

  @Column({ type: 'varchar', nullable: true }) chunk_id: string | null;
  @Column({ type: 'varchar', nullable: true }) document_id: string | null;
  @Column({ type: 'float', nullable: true }) similarity_score: number | null;
  @Column({ type: 'int', nullable: true }) rank: number | null;
}
