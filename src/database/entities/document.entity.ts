import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocumentChunk } from './document-chunk.entity';

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** An admin-uploaded source. Permanent, shared, and searchable.
 *  Never to be confused with user_uploads, which is the opposite of all three. */
@Entity('documents')
@Index(['category_id', 'state_scope', 'status'])
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() title: string;
  @Column() filename: string;
  @Column() storage_key: string;
  @Column() file_type: string;
  @Column({ type: 'bigint', nullable: true }) file_size: string | null;

  @Column({ type: 'varchar', nullable: true }) category_id: string | null;

  /** null means the document applies nationally. */
  @Column({ type: 'varchar', nullable: true }) state_scope: string | null;

  @Column({ type: 'date', nullable: true }) document_date: string | null;

  /** Distinguishes government PDFs from the client's own practical notes. */
  @Column({ default: true }) is_official: boolean;

  @Column({ type: 'varchar', default: 'queued' }) status: DocumentStatus;
  @Column({ type: 'text', nullable: true }) failure_reason: string | null;
  @Column({ default: false }) used_ocr: boolean;
  @Column({ type: 'int', default: 0 }) chunk_count: number;
  @Column({ type: 'varchar', nullable: true }) uploaded_by: string | null;

  @OneToMany(() => DocumentChunk, (chunk) => chunk.document)
  chunks: DocumentChunk[];

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deleted_at: Date | null;
}
