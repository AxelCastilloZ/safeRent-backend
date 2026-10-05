import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Conversation } from "../../conversation/entities/conversation.entity";
import { User } from "../../../user/entities/user.entity";
import { MessageFile } from "../../message-file/entities/message-file.entity";

@Entity()
export class Message {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 2000,
    })
    message!: string;

    @CreateDateColumn()
    createdAt!: Date;

    // --- Relations ---

    @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
    conversation!: Conversation;

    @ManyToOne(() => User, (user) => user.sentMessages)
    sender!: User;

    @OneToMany(() => MessageFile, (file) => file.message, { cascade: true })
    files!: MessageFile[];
}
