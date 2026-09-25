import { ConflictException, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UserService } from '../user/user.service';
import { RoleService } from '../role/role.service';
import { User } from '../user/entities/user.entity';

// Registration does not issue tokens; keep the ESM JWT package out of this unit test.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

describe('Registration', () => {
  const role = { id: 2, name: 'CLIENT', isActive: true };
  const dto: RegisterDto = {
    idCard: '123456789', name: 'Jose', surname1: 'Perez',
    email: 'jose@example.com', phoneNumber: '88888888',
    birthdate: new Date('2000-01-01'), password: 'Password123!',
  };
  const repo = {
    findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
  };
  const roles = { findActiveByName: jest.fn(), findOne: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    roles.findActiveByName.mockResolvedValue(role);
    roles.findOne.mockResolvedValue(role);
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((value: object) => value);
    repo.save.mockImplementation((value: object) => ({ ...value, id: 1 }));
    const users = new UserService(
      repo as unknown as Repository<User>, roles as unknown as RoleService,
    );
    service = new AuthService(users, {} as JwtService, roles as unknown as RoleService);
  });

  it('hashes the password, forces CLIENT and returns no password', async () => {
    const result = await service.register({ ...dto, roleId: 1 } as RegisterDto);
    const saved = repo.save.mock.calls[0][0] as User;
    expect(saved.Roles).toEqual([role]);
    expect(saved.password).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, saved.password)).toBe(true);
    expect(result).toEqual({ id: 1, name: dto.name, email: dto.email, roles: ['CLIENT'] });
    expect(result).not.toHaveProperty('password');
  });

  it('rejects an existing email or identification', async () => {
    repo.findOne.mockResolvedValue({ id: 4 });
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('handles concurrent duplicate registrations', async () => {
    repo.save.mockRejectedValue(new QueryFailedError('INSERT', [],
      Object.assign(new Error('duplicate'), { code: '23505' })));
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not create users when CLIENT is missing or inactive', async () => {
    roles.findActiveByName.mockResolvedValue(null);
    await expect(service.register(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (body: object) => pipe.transform(body, { type: 'body', metatype: RegisterDto });

  it('accepts registration without roleId and transforms birthdate', async () => {
    const result = await validate({ ...dto, birthdate: '2000-01-01' });
    expect(result.birthdate).toBeInstanceOf(Date);
  });

  it.each([
    { roleId: 1 }, { Roles: ['ADMIN'] }, { isActive: false },
    { password: 'weak' }, { password: 'Aa1!' + 'é'.repeat(35) },
    { email: 'invalid' },
  ])('rejects invalid or privileged input %j', async (extra) => {
    await expect(validate({ ...dto, ...extra })).rejects.toThrow();
  });
});
