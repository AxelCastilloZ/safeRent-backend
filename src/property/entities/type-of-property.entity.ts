import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Property } from "./property.entity";

@Entity()
export class TypeOfProperty {
    @PrimaryGeneratedColumn()
    id!: number;

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
