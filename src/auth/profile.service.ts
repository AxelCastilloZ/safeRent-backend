import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, QueryFailedError } from 'typeorm';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly db: DataSource) {}
  private view(user: User) {
    return {
      id: user.id,
      idCard: user.idCard,
      name: user.name,
      surname1: user.surname1,
      surname2: user.surname2 ?? '',
      email: user.email,
      phoneNumber: user.phoneNumber,
      birthdate:
        user.birthdate instanceof Date
          ? user.birthdate.toISOString().slice(0, 10)
          : user.birthdate,
      roles: user.Roles.filter((role) => role.isActive).map(
        (role) => role.name,
      ),
      createdAt: user.createdAt,
    };
  }
  async get(id: number) {
    const user = await this.db
      .getRepository(User)
      .findOne({ where: { id, isActive: true }, relations: { Roles: true } });
    if (!user) throw new NotFoundException('Usuario no disponible.');
    return this.view(user);
  }
  private async limit(id: number) {
    const key = createHash('sha256')
      .update(`account-security:${id}`)
      .digest('hex');
    const rows: { count: number }[] = await this.db.query(
      `INSERT INTO password_recovery_limits ("key","count","expiresAt") VALUES ($1,1,now()+interval '15 minutes')
      ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN password_recovery_limits."expiresAt"<=now() THEN 1 ELSE password_recovery_limits."count"+1 END,
      "expiresAt"=CASE WHEN password_recovery_limits."expiresAt"<=now() THEN now()+interval '15 minutes' ELSE password_recovery_limits."expiresAt" END RETURNING "count"`,
      [key],
    );
    if (rows[0].count > 10)
      throw new HttpException(
        'Demasiados intentos. Intenta nuevamente en 15 minutos.',
        429,
      );
  }
  async update(id: number, dto: UpdateProfileDto) {
    await this.limit(id);
    try {
      await this.db.transaction(async (manager) => {
        const user = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .addSelect('user.password')
          .where('user.id = :id AND user.isActive = true', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!user) throw new NotFoundException('Usuario no disponible.');
        if (dto.email !== user.email) {
          if (
            !dto.currentPassword ||
            !(await bcrypt.compare(dto.currentPassword, user.password))
          )
            throw new BadRequestException(
              'Para cambiar el correo, indica tu contraseña actual correcta.',
            );
          const duplicate = await manager
            .getRepository(User)
            .createQueryBuilder('user')
            .where('LOWER(user.email) = LOWER(:email) AND user.id != :id', {
              email: dto.email,
              id,
            })
            .getOne();
          if (duplicate)
            throw new ConflictException('El correo ya está registrado.');
          await manager.update(
            PasswordResetToken,
            { userId: id, usedAt: IsNull() },
            { usedAt: new Date() },
          );
          await manager.update(User, id, { passwordChangedAt: new Date() });
        }
        // Explicit allowlist: identity, roles, activation and credentials cannot be assigned by this endpoint.
        await manager.update(User, id, {
          name: dto.name,
          surname1: dto.surname1,
          surname2: dto.surname2 ?? '',
          email: dto.email,
          phoneNumber: dto.phoneNumber,
          birthdate: dto.birthdate,
        });
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('El correo ya está registrado.');
      throw error;
    }
    return this.get(id);
  }
  async changePassword(id: number, dto: ChangePasswordDto) {
    await this.limit(id);
    await this.db.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.password')
        .addSelect('user.sessionVersion')
        .where('user.id = :id AND user.isActive = true', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!user) throw new NotFoundException('Usuario no disponible.');
      if (!(await bcrypt.compare(dto.currentPassword, user.password)))
        throw new BadRequestException('La contraseña actual es incorrecta.');
      if (await bcrypt.compare(dto.password, user.password))
        throw new BadRequestException(
          'La nueva contraseña debe ser diferente de la actual.',
        );
      await manager.update(User, id, {
        password: await bcrypt.hash(dto.password, 10),
        sessionVersion: user.sessionVersion + 1,
        passwordChangedAt: new Date(),
      });
      await manager.update(
        PasswordResetToken,
        { userId: id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
    });
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }
}
