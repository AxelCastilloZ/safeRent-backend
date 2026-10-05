import {
    Column,
    CreateDateColumn,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";
import { TypeOfProperty } from "./type-of-property.entity";
import { Service } from "../../service/entities/service.entity";
import { PropertyFile } from "./property-file.entity";
import { IconDescription } from "./icon-description.entity";
import { Conversation } from "../../messages/conversation/entities/conversation.entity";
import { PropertyStatus } from "../property-status.enum";

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
        type: 'enum',
        enum: PropertyStatus,
        default: PropertyStatus.DRAFT,
    })
    status!: PropertyStatus;

    @Column({
        type: 'text',
        nullable: true,
    })
    reviewNote?: string;

    @Column({
        type: 'timestamp',
        nullable: true,
    })
    reviewedAt?: Date;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @Column({ type: 'int', nullable: true })
    reservedTenantId!: number | null;

    @Column({ type: 'varchar', length: 350, nullable: true })
    reservedTenantName!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    reservedAt!: Date | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
    reservedTenant?: User | null;

    // --- Relations ---

    @Column({ type: 'int' })
    ownerId!: number;

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

    @OneToMany(() => Conversation, (conversation) => conversation.property)
    conversations!: Conversation[];
}
