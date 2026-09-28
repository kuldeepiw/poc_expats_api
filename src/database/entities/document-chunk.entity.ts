import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DocumentEntity } from './document.entity';

/**
 * The unit that is embedded, searched and cited.
 *
 * ON DELETE CASCADE from documents is not optional: if these survive their
 * document, deleted information keeps producing answers.
 */
@Entity('document_chunks')
@Index(['document_id'])
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => DocumentEntity, (doc) => doc.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;
  @Column() document_id: string;

  @Column({ type: 'int' }) chunk_index: number;
  @Column({ type: 'text' }) content: string;

  /** vector(N) — N comes from EMBEDDING_DIMENSIONS and is set in the migration. */
  @Column({ type: 'text', nullable: true }) embedding: string | null;

  /** Recorded so a future embedding-model change is detectable rather than silent. */
  @Column({ type: 'varchar', nullable: true }) embedding_model: string | null;

  @Column({ type: 'int', nullable: true }) token_count: number | null;
  @Column({ type: 'int', nullable: true }) page_number: number | null;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
