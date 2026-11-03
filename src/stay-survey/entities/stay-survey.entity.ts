import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { Reservation } from '../../reservation/entities/reservation.entity';
import { User } from '../../user/entities/user.entity';

const kilometers = { to: (value: number | null) => value, from: (value: string | null) => (value === null ? null : Number(value)) };

/**
 * Encuesta que el inquilino responde cuando termina su estadía: cómo fueron en la práctica los servicios y el entorno.
 * Es una por reserva. Se pide al inquilino (y no al propietario) porque son datos que solo quien vivió ahí puede dar de forma imparcial;
 * con ellas se calculan los promedios que usan los filtros del explorador.
 */
@Entity('stay_survey')
@Index('idx_stay_survey_property', ['propertyId'])
@Unique('uq_stay_survey_reservation', ['reservationId'])
@Check('ck_stay_survey_water', '"waterStability" BETWEEN 1 AND 5')
@Check('ck_stay_survey_electricity', '"electricityStability" BETWEEN 1 AND 5')
export class StaySurvey {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 1 (se va seguido) a 5 (siempre estable). */
  @Column({ type: 'smallint' })
  waterStability!: number;

  @Column({ type: 'smallint' })
  electricityStability!: number;

  /** Velocidad de Internet que midió el inquilino, en Mbps. */
  @Column({ type: 'int' })
  internetMbps!: number;

  /** Distancia en kilómetros; vacío si no la sabe. */
  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true, transformer: kilometers })
  universityKm!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true, transformer: kilometers })
  coworkingKm!: number | null;

  @Column({ type: 'boolean', default: false })
  hasWorkArea!: boolean;

  @Column({ type: 'int' })
  reservationId!: number;

  @Column({ type: 'int' })
  propertyId!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Reservation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservationId', foreignKeyConstraintName: 'fk_stay_survey_reservation' })
  reservation!: Reservation;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_stay_survey_property' })
  property!: Property;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId', foreignKeyConstraintName: 'fk_stay_survey_tenant' })
  tenant!: User;
}
