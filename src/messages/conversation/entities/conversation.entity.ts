import {
    CreateDateColumn,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../../user/entities/user.entity";
import { Property } from "../../../property/entities/property.entity";
import { Message } from "../../message/entities/message.entity";

@Entity()
export class Conversation {
    @PrimaryGeneratedColumn()
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    // --- Relations ---

    @ManyToMany(() => User, (user) => user.conversations)
    @JoinTable()
    participants!: User[];

    // Vacía en las conversaciones directas (administrador ↔ usuario), que no giran en torno a una propiedad.
    @ManyToOne(() => Property, (property) => property.conversations, { nullable: true })
    property!: Property | null;

    @OneToMany(() => Message, (message) => message.conversation)
    messages!: Message[];
}
