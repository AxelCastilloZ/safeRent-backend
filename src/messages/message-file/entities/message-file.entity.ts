import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Message } from "../../message/entities/message.entity";

@Entity()
export class MessageFile {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    uploadedBy?: string;

    @Column({
        type: 'varchar',
        length: 500,
    })
    path!: string;

    @Column({
        type: 'varchar',
        length: 255,
    })
    fileName!: string;

    @Column({
        type: 'varchar',
        length: 100,
    })
    mimeType!: string;

    @Column({
        type: 'int',
    })
    size!: number;

    @Column({
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    rev?: string;

    @CreateDateColumn()
    uploadedAt!: Date;

    // --- Relations ---

    @ManyToOne(() => Message, (message) => message.files, { onDelete: 'CASCADE' })
    message!: Message;
}
