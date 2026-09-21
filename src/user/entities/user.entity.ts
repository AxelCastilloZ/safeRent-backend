import { Role } from "src/role/entities/role.entity";
import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 50,
        unique: true,
    })
    idCard!: string;

    @Column({
        type: 'varchar',
        length: 200,
    })
    name!: string;

    @Column({
        type: 'varchar',
        length: 100,
    })
    surname1!: string;

    @Column({
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    surname2?: string;

    @Column({
        type: 'varchar',
        length: 150,
        unique: true,
    })
    email!: string;

    @Column({
        type: 'varchar',
        length: 20,
    })
    phoneNumber!: string;

    @Column({
        type: 'date',
    })
    birthdate!: Date;

    @Column({
        type: 'varchar',
        length: 255,
        select: false,
    })
    password!: string;

    @Column({
        type: 'boolean',
        default: true,
    })
    isActive!: boolean;

    //RELATIONSHIPS
    @ManyToMany(()=>Role)
    @JoinTable({ name: 'user_role' })
    Roles!: Role[];
}
