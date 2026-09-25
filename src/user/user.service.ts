import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { RoleService } from 'src/role/role.service';

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

  async findAll() {
    const users = await this.userRepo.find({
      relations: { Roles: true,},
    });
    if (users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return users;
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
