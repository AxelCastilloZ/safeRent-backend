import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Historial de reservas: una fila por cada vez que una propiedad se reservó para un inquilino.
 * La reserva vigente sigue viviendo en `property.reservedTenantId`; esta tabla conserva lo que pasó
 * después de que se libera (cuándo terminó y con qué motivo).
 */
@Entity('reservation')
@Index('idx_reservation_property', ['propertyId'])
@Index('idx_reservation_tenant', ['tenantId'])
// Una propiedad solo puede tener una reserva vigente a la vez.
@Index('uq_reservation_active_property', ['propertyId'], { unique: true, where: '"endedAt" IS NULL' })
export class Reservation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  /** Vacío mientras la reserva está vigente. */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  /** Motivo que dio el propietario al quitar la reserva. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  endReason?: string | null;

  @Column({ type: 'int' })
  propertyId!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'int' })
  ownerId!: number;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_reservation_property' })
  property!: Property;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId', foreignKeyConstraintName: 'fk_reservation_tenant' })
  tenant!: User;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId', foreignKeyConstraintName: 'fk_reservation_owner' })
  owner!: User;
}
