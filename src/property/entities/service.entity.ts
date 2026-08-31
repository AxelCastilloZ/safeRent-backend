import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Property } from "./property.entity";

@Entity()
export class Service {
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
        length: 100,
        nullable: true,
    })
    icono?: string;

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    description?: string;

    @ManyToMany(() => Property, (property) => property.services)
    properties!: Property[];
}
