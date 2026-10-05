import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RoleService } from '../role/role.service';
import { AppRole } from './access';
import { QueryFailedError } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly roles: RoleService,
  ) {}

  async register(dto: RegisterDto) {
    const role = await this.roles.findActiveByName(AppRole.CLIENT);
    if (!role) {
      throw new ServiceUnavailableException('El rol CLIENT no está disponible');
    }

    try {
      const user = await this.users.create({
        idCard: dto.idCard,
        name: dto.name,
        surname1: dto.surname1,
        surname2: dto.surname2,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        birthdate: dto.birthdate,
        password: dto.password,
        roleId: role.id,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: [role.name],
      };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('La identificación o el correo ya están registrados');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.users.findForLogin(dto.email);

    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(dto.password, user.password))
    ) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    return {
      access_token: await this.jwt.signAsync({
        sub: user.id,
      }),
    };
  }
}
