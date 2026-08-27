import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Property {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 100,
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
        length: 3,
    })
    typeOfCoin!: string;

    @Column({
        type: 'varchar',
        length: 255,
    })
    address!: string;

    @Column({
        type: 'text',
        array: true,
        default: [],
    })
    images!: string[];

    @Column({
        type: 'boolean',
        default: true,
    })
    isActive!: boolean;
}


