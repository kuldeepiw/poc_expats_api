import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** Firebase owns credentials. No password is ever stored here. */
  @Index({ unique: true }) @Column({ type: 'varchar', nullable: true }) firebase_uid: string | null;

  @Index({ unique: true }) @Column() email: string;
  @Column({ default: 'password' }) auth_provider: string;
  @Column({ type: 'varchar', nullable: true }) full_name: string | null;
  @Column({ type: 'varchar', nullable: true }) country_of_origin: string | null;

  /** Required at first sign-in. Filters retrieval on every question. */
  @Column({ type: 'varchar', nullable: true }) state: string | null;
  @Column({ type: 'varchar', nullable: true }) city: string | null;

  @Column({ default: false }) is_verified: boolean;
  @Column({ default: false }) is_blocked: boolean;
  @Column({ type: 'varchar', nullable: true }) blocked_reason: string | null;
  @Column({ type: 'timestamptz', nullable: true }) last_active_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deleted_at: Date | null;
}
