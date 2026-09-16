import {
    Column,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";
import { TypeOfProperty } from "./type-of-property.entity";
import { Service } from "./service.entity";
import { PropertyFile } from "./property-file.entity";
import { IconDescription } from "./icon-description.entity";

@Entity()
export class Property {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 200,
    })
    title!: string;

    @Column({
        type: 'text',
    })
    description!: string;

    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
    })
    cost!: number;

    @Column({
        type: 'varchar',
        length: 10,
        default: 'CRC',
    })
    typeOfCoin!: string;

    @Column({
        type: 'varchar',
        length: 300,
    })
    address!: string;

    @Column({ type: 'double precision', nullable: true })
    latitude?: number;

    @Column({ type: 'double precision', nullable: true })
    longitude?: number;

    @Column({
        type: 'int',
        default: 1,
    })
    guest!: number;

    @Column({
        type: 'int',
        default: 1,
    })
    rooms!: number;

    @Column({
        type: 'boolean',
        default: false,
    })
    isActive!: boolean;

    // --- Relations ---

    @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
    owner!: User;

    @ManyToOne(() => TypeOfProperty, (type) => type.properties, { eager: true, onDelete: 'SET NULL', nullable: true })
    typeOfProperty?: TypeOfProperty;

    @ManyToMany(() => Service, (service) => service.properties, { eager: true })
    @JoinTable()
    services!: Service[];

    @OneToMany(() => PropertyFile, (file) => file.property, { cascade: true })
    files!: PropertyFile[];

    @OneToMany(() => IconDescription, (icon) => icon.property, { cascade: true })
    iconDescriptions!: IconDescription[];
}
