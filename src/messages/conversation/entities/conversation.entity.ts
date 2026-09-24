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

    @ManyToOne(() => Property, (property) => property.conversations)
    property!: Property;

    @OneToMany(() => Message, (message) => message.conversation)
    messages!: Message[];
}
