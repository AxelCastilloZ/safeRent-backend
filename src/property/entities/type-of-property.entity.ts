import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Property } from "./property.entity";
import type { CatalogTranslationsDto } from '../../common/catalog-translations.dto';

@Entity()
export class TypeOfProperty {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
    catalogCode?: string | null;

    @Column({ type: 'jsonb', nullable: true })
    translations?: CatalogTranslationsDto | null;

    @Column({
        type: 'varchar',
        length: 100,
        unique: true,
    })
    name!: string;

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    description?: string;

    @Column({
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    icon?: string;

    @OneToMany(() => Property, (property) => property.typeOfProperty)
    properties!: Property[];
}
