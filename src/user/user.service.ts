import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { RoleService } from 'src/role/role.service';

/** Forma segura de un usuario para el panel de administración: sin cédula, teléfono ni fecha de nacimiento. */
export interface AdminUserView {
  id: number;
  name: string;
  surname1: string;
  surname2?: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  roles: { id: number; name: string; isActive: boolean }[];
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly rolesService: RoleService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    await this.userCheck(createUserDto.idCard, createUserDto.email);

    const {password, roleId, ...rest}= createUserDto;
    const hashed= await bcrypt.hash(password,10);

    const role= await this.rolesService.findOne(roleId);

    const newUser = this.userRepo.create({...rest, password:hashed, Roles: [role]});
    return await this.userRepo.save(newUser);
  }

  /** Listado para el panel de administración: proyección segura (sin cédula, teléfono ni fecha de nacimiento). */
  async findAllForAdmin(): Promise<AdminUserView[]> {
    const users = await this.userRepo.find({
      relations: { Roles: true },
      order: { id: 'DESC' },
    });
    return users.map((user) => this.toAdminView(user));
  }

  private toAdminView(user: User): AdminUserView {
    return {
      id: user.id,
      name: user.name,
      surname1: user.surname1,
      surname2: user.surname2,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: (user.Roles ?? []).map((role) => ({
        id: role.id,
        name: role.name,
        isActive: role.isActive,
      })),
    };
  }

  /** Activa o desactiva la cuenta (p. ej. por mal uso de la aplicación) sin borrar al usuario. */
  async setActive(id: number, isActive: boolean) {
    await this.findOne(id);
    await this.userRepo.update(id, { isActive });
    const user = await this.userRepo.findOne({ where: { id }, relations: { Roles: true } });
    return this.toAdminView(user!);
  }

  /** Agrega un rol al usuario (p. ej. convertir un inquilino también en propietario). */
  async addRole(id: number, roleId: number) {
    const user = await this.userRepo.findOne({ where: { id }, relations: { Roles: true } });
    if (!user) {
      throw new NotFoundException(`User with Id ${id} not found`);
    }

    const role = await this.rolesService.findOne(roleId);

    if (!user.Roles.some((existing) => existing.id === role.id)) {
      user.Roles = [...user.Roles, role];
      await this.userRepo.save(user);
    }

    return this.toAdminView(user);
  }

  /** Quita un rol del usuario. Falla si es el único rol que le queda: todo usuario debe tener al menos uno. */
  async removeRole(id: number, roleId: number) {
    const user = await this.userRepo.findOne({ where: { id }, relations: { Roles: true } });
    if (!user) {
      throw new NotFoundException(`User with Id ${id} not found`);
    }

    if (user.Roles.length <= 1 && user.Roles.some((role) => role.id === roleId)) {
      throw new ConflictException('El usuario debe conservar al menos un rol.');
    }

    user.Roles = user.Roles.filter((role) => role.id !== roleId);
    await this.userRepo.save(user);

    return this.toAdminView(user);
  }

  /**
   * Garantiza que el usuario tenga el rol indicado; si ya lo tiene, no hace nada.
   * Se usa para otorgar automáticamente el rol de propietario cuando un inquilino
   * crea su primera propiedad (ver PropertyService.create).
   */
  async ensureRole(id: number, roleName: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id }, relations: { Roles: true } });
    if (!user) {
      throw new NotFoundException(`User with Id ${id} not found`);
    }

    if (user.Roles.some((role) => role.name === roleName)) {
      return;
    }

    const role = await this.rolesService.findActiveByName(roleName);
    if (!role) {
      return;
    }

    user.Roles = [...user.Roles, role];
    await this.userRepo.save(user);
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOneBy({ id });

    if (!user) {
      throw new NotFoundException(`User with Id ${id} not found`);
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.userRepo.update(id, updateUserDto);
    return await this.findOne(id);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    return await this.userRepo.remove(user);
  }
  
  async userCheck(idCard: string, email: string) {
    const user = await this.userRepo.findOne({
      where: [{ idCard }, { email }],
    });

    if (user) {
      throw new ConflictException(`User with Card Id ${idCard} or email ${email} already exists`);
    }

    return true;
  }

  findForLogin(email: string) {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  findForAuth(id: number) {
    return this.userRepo.findOne({
      where: { id, isActive: true },
      relations: { Roles: true },
    });
  }
}
