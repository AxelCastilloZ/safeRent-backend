import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Property } from "./property.entity";

@Entity()
export class PropertyFile {
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

    @ManyToOne(() => Property, (property) => property.files, { onDelete: 'CASCADE' })
    property!: Property;
}
