import { Injectable, NotFoundException } from '@nestjs/common';
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
    await this.roleRepo.update(id, updateRoleDto);
    return await this.findOne(id);
  }

  async remove(id: number) {
    const role = await this.findOne(id);
    return await this.roleRepo.remove(role);
  }
}
