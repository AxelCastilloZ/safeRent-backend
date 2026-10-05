import { Role } from "../../role/entities/role.entity";
import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Conversation } from "../../messages/conversation/entities/conversation.entity";
import { Message } from "../../messages/message/entities/message.entity";

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

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    //RELATIONSHIPS
    @ManyToMany(()=>Role)
    @JoinTable({ name: 'user_role' })
    Roles!: Role[];
    // --- Relations ---

    @ManyToMany(() => Conversation, (conversation) => conversation.participants)
    conversations!: Conversation[];

    @OneToMany(() => Message, (message) => message.sender)
    sentMessages!: Message[];
}
