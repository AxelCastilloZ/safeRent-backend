import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { User } from '../../user/entities/user.entity';

@Entity('property_comment')
@Unique('uq_property_comment_author', ['property', 'author'])
export class PropertyComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 1000 })
  content!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_property_comment_property' })
  property!: Property;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId', foreignKeyConstraintName: 'fk_property_comment_author' })
  author!: User;
}
