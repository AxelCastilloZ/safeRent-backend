import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('password_reset_tokens')
@Index(['userId', 'expiresAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn() id!: number;
  @Column() userId!: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
  @Column({ type: 'char', length: 64, unique: true }) tokenHash!: string;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) usedAt!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('password_recovery_jobs')
export class PasswordRecoveryJob {
  @PrimaryGeneratedColumn() id!: number;
  // AES-GCM encrypted identifier. No raw token is persisted in the job.
  @Column({ type: 'text' }) payload!: string;
  @Column({ default: 0 }) attempts!: number;
  @Index()
  @Column({ type: 'timestamptz' })
  availableAt!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('password_recovery_limits')
export class PasswordRecoveryLimit {
  @Column({ primary: true, type: 'char', length: 64 }) key!: string;
  @Column({ default: 1 }) count!: number;
  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;
}
