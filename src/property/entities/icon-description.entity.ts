import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Property } from "./property.entity";

@Entity()
export class IconDescription {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 100,
    })
    title!: string;

    @Column({
        type: 'varchar',
        length: 100,
    })
    icon!: string;

    @ManyToOne(() => Property, (property) => property.iconDescriptions, { onDelete: 'CASCADE' })
    property!: Property;
}
