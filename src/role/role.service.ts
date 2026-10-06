import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}
  
  async create(createRoleDto: CreateRoleDto) {
    const newRole = this.roleRepo.create(createRoleDto);
    return await this.roleRepo.save(newRole);
  }
  
  async findAll() {
    const roles = await this.roleRepo.find();
    if (roles.length === 0) {
      throw new NotFoundException('No roles found');
    }
    return roles;
  }

  async findOne(id: number) {
    const role = await this.roleRepo.findOneBy({ id });

    if (!role) {
      throw new NotFoundException(`Role with Id ${id} not found`);
    }

    return role;
  }

  findActiveByName(name: string) {
    return this.roleRepo.findOneBy({ name, isActive: true });
  }

  async update(id: number, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (['ADMIN', 'OWNER', 'CLIENT'].includes(role.name) &&
        ((updateRoleDto.name !== undefined && updateRoleDto.name !== role.name) || updateRoleDto.isActive === false)) {
      throw new BadRequestException('No se puede cambiar el nombre ni desactivar un rol del sistema');
    }
    await this.roleRepo.update(id, updateRoleDto);
    return await this.findOne(id);
  }

  async remove(id: number) {
    const role = await this.findOne(id);
    if (['ADMIN', 'OWNER', 'CLIENT'].includes(role.name)) throw new BadRequestException('No se puede eliminar un rol del sistema');
    return await this.roleRepo.remove(role);
  }
}
