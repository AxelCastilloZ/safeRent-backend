import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import type { AvailabilityRule } from '../visit-slots';

/**
 * Días y horas en que el propietario atiende citas de una propiedad. Si no hay fila, se usa el horario por defecto
 * (ver `DEFAULT_RULES`), así que no hace falta crearla al publicar.
 */
@Entity('property_availability')
@Unique('uq_property_availability_property', ['propertyId'])
export class PropertyAvailability {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  propertyId!: number;

  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({ type: 'jsonb' })
  rules!: AvailabilityRule[];

  /** Si es true, las citas que piden los inquilinos quedan confirmadas al instante, sin que el propietario deba responder. */
  @Column({ type: 'boolean', default: false })
  autoConfirm!: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // ManyToOne (y no OneToOne) para que la unicidad la dé solo la restricción con nombre de arriba.
  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_property_availability_property' })
  property!: Property;
}
