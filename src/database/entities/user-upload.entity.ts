import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A user's own file. Temporary, private, and NEVER embedded or written to
 * document_chunks. Indexing one would make a stranger's medical report
 * searchable by other users.
 *
 * extracted_text may be passed into a prompt as private context when the user
 * asks a follow-up question about it. That is use, not indexing.
 */
@Entity('user_uploads')
@Index(['expires_at'])
export class UserUpload {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() user_id: string;
  @Column({ type: 'varchar', nullable: true }) conversation_id: string | null;

  @Column() original_filename: string;
  @Column() storage_key: string;
  @Column() file_type: string;
  @Column({ type: 'varchar', default: 'general' })
  document_kind: 'medical' | 'general';

  @Column({ default: false }) used_vision: boolean;

  /** Vision models return no confidence score, so the response schema asks
   *  for this instead. It drives "we could not read this clearly". */
  @Column({ type: 'varchar', nullable: true })
  legibility: 'high' | 'medium' | 'low' | null;

  @Column({ type: 'varchar', default: 'queued' }) status: string;
  @Column({ type: 'text', nullable: true }) failure_reason: string | null;

  @Column({ type: 'text', nullable: true }) extracted_text: string | null;
  @Column({ type: 'text', nullable: true }) translated_text: string | null;
  @Column({ type: 'text', nullable: true }) explanation: string | null;

  /** Written in Spanish, so the treating doctor can read it directly. */
  @Column({ type: 'text', nullable: true }) doctor_summary: string | null;

  @Column({ type: 'timestamptz', nullable: true }) expires_at: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deleted_at: Date | null;
}
