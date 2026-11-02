import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Property } from '../../property/entities/property.entity';

/**
 * Una persona que abrió una propiedad. Se identifica con un código anónimo que guarda su navegador,
 * así volver a abrirla o refrescar la página no suma otra vista y se cuentan personas distintas.
 */
@Entity('property_view')
@Index('idx_property_view_property', ['propertyId'])
@Unique('uq_property_view_visitor', ['propertyId', 'visitorId'])
export class PropertyView {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  propertyId!: number;

  @Column({ type: 'varchar', length: 64 })
  visitorId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  firstViewedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastViewedAt!: Date;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_property_view_property' })
  property!: Property;
}
