import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Reservation } from '../../reservation/entities/reservation.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Calificación que un propietario le da a un inquilino por una reserva suya.
 * Es una por reserva (el propietario puede editarla): así solo califica a quien realmente tuvo y no puede repetir su voto.
 */
@Entity('tenant_rating')
@Index('idx_tenant_rating_tenant', ['tenantId'])
@Unique('uq_tenant_rating_reservation', ['reservationId'])
@Check('ck_tenant_rating_rating', '"rating" BETWEEN 1 AND 5')
export class TenantRating {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment!: string | null;

  @Column({ type: 'int' })
  reservationId!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'int' })
  ownerId!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Reservation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservationId', foreignKeyConstraintName: 'fk_tenant_rating_reservation' })
  reservation!: Reservation;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId', foreignKeyConstraintName: 'fk_tenant_rating_tenant' })
  tenant!: User;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId', foreignKeyConstraintName: 'fk_tenant_rating_owner' })
  owner!: User;
}
