import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Role {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        unique: true,
        nullable: false,
        type: 'varchar',
        length: 200,
    })
    name!: string;

    @Column({
        type: 'text',
        nullable: false,
    })
    description!: string;

    @Column({
        type: 'boolean',
        default: true,
    })
    isActive!: boolean;
}