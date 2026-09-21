import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Property } from '../../property/entities/property.entity';

// Keep the existing table name when moving the entity out of PropertyModule.
@Entity('service')
export class Service {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icono?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  // A catalog entry cannot be removed while a property uses it.
  @ManyToMany(() => Property, (property) => property.services, {
    onDelete: 'RESTRICT',
  })
  properties!: Property[];
}
