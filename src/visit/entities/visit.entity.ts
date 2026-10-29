import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { User } from '../../user/entities/user.entity';
import { VisitStatus } from '../visit-status.enum';

/**
 * Cita para visitar una propiedad. El horario (`scheduledAt`) queda retenido mientras la cita esté pendiente,
 * en contrapropuesta o confirmada: el índice único parcial impide que dos personas tengan el mismo horario,
 * así el primero que lo pide es quien lo conserva.
 */
@Entity('visit')
@Index('idx_visit_owner_status', ['ownerId', 'status'])
@Index('idx_visit_tenant_status', ['tenantId', 'status'])
@Index('uq_visit_active_slot', ['propertyId', 'scheduledAt'], {
  unique: true,
  where: `"status" IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED')`,
})
// Un propietario tampoco puede tener dos citas confirmadas a la misma hora, aunque sean de propiedades distintas.
@Index('uq_visit_owner_confirmed_slot', ['ownerId', 'scheduledAt'], { unique: true, where: `"status" = 'CONFIRMED'` })
export class Visit {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Momento de la solicitud (lo fija el servidor): define quién fue primero. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /** Horario vigente de la cita. Si el propietario propone otro, aquí queda el nuevo. */
  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  /** Horario que pidió el inquilino cuando hay una contrapropuesta. */
  @Column({ type: 'timestamptz', nullable: true })
  previousScheduledAt?: Date | null;

  @Column({ type: 'varchar', length: 20, default: VisitStatus.PENDING })
  status!: VisitStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason?: string | null;

  /** Quién canceló: 'TENANT', 'OWNER' o 'SYSTEM' (por ejemplo, cuando la propiedad se reservó para otra persona). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  cancelledBy?: 'TENANT' | 'OWNER' | 'SYSTEM' | null;

  /** Zona horaria de la propiedad cuando se creó la cita: la hora se muestra siempre en esa zona. */
  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  /** Hasta cuándo se espera una respuesta (solo pendiente y contrapropuesta). */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null;

  /** Última vez que se le avisó por correo al propietario de esta solicitud (inmediato o en un resumen). */
  @Column({ type: 'timestamptz', nullable: true })
  ownerNotifiedAt?: Date | null;

  /** Cuándo se mandó el recordatorio de la cita (una sola vez). */
  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt?: Date | null;

  @Column({ type: 'int' })
  propertyId!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'int' })
  ownerId!: number;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_visit_property' })
  property!: Property;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId', foreignKeyConstraintName: 'fk_visit_tenant' })
  tenant!: User;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId', foreignKeyConstraintName: 'fk_visit_owner' })
  owner!: User;
}
