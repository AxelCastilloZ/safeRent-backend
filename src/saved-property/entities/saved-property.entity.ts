import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { User } from '../../user/entities/user.entity';

/** Propiedad que un inquilino guardó para revisar después. Una sola vez por pareja usuario–propiedad. */
@Entity('saved_property')
@Unique('uq_saved_property_user_property', ['user', 'property'])
@Index('idx_saved_property_user_created', ['user', 'createdAt'])
export class SavedProperty {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Si se borra la cuenta o la propiedad, desaparece el "guardado" (no tiene sentido sin alguno de los dos).
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'fk_saved_property_user' })
  user!: User;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_saved_property_property' })
  property!: Property;
}
