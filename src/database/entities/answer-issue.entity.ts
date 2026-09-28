import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Thumbs-down feedback and unanswered questions are the same thing
 * operationally: this answer had a problem, and some document would fix it.
 * Deduplicated on normalized_text with occurrence_count incrementing, so one
 * loud user does not outrank fifty quiet ones.
 */
@Entity('answer_issues')
@Index(['normalized_text'])
export class AnswerIssue {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar' }) type: 'feedback' | 'unanswered';
  @Column({ type: 'varchar', nullable: true }) message_id: string | null;
  @Column({ type: 'varchar', nullable: true }) user_id: string | null;

  @Column({ type: 'text' }) question_text: string;
  @Column({ type: 'text' }) normalized_text: string;

  @Column({ type: 'boolean', nullable: true }) is_helpful: boolean | null;
  @Column({ type: 'text', nullable: true }) comment: string | null;
  @Column({ type: 'varchar', nullable: true }) category_id: string | null;
  @Column({ type: 'varchar', nullable: true }) user_state: string | null;

  @Column({ type: 'int', default: 1 }) occurrence_count: number;
  @Column({ type: 'timestamptz', default: () => 'now()' }) first_seen_at: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) last_seen_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolved_at: Date | null;
  @Column({ type: 'varchar', nullable: true }) resolved_by_document_id: string | null;
}
