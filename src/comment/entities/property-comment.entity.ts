import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { User } from '../../user/entities/user.entity';

@Entity('property_comment')
@Unique('uq_property_comment_author', ['property', 'author'])
@Check('ck_property_comment_rating', '"rating" BETWEEN 1 AND 5')
export class PropertyComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 1000 })
  content!: string;

  // Existing comments retain no score; they do not contribute to the average.
  @Column({ type: 'smallint', nullable: true })
  rating!: number | null;

  @Column({ type: 'boolean', default: false })
  hidden!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  moderationNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  moderatedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  moderatedById!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'moderatedById', foreignKeyConstraintName: 'fk_comment_moderator' })
  moderatedBy?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Property, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId', foreignKeyConstraintName: 'fk_property_comment_property' })
  property!: Property;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId', foreignKeyConstraintName: 'fk_property_comment_author' })
  author!: User;
}
