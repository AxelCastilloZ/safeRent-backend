import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { RoleService } from '../role/role.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// This unit tests the login decision and signed claims. JWT verification is covered by guard tests.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

describe('AuthService', () => {
  let service: AuthService;
  const users = { findForLogin: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  let passwordHash: string;

  beforeAll(async () => { passwordHash = await bcrypt.hash('ValidTest123!', 10); });

  beforeEach(async () => {
    jest.clearAllMocks();
    users.findForLogin.mockResolvedValue({ id: 7, isActive: true, sessionVersion: 3, password: passwordHash });
    jwt.signAsync.mockResolvedValue('signed-test-token');
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService,
        { provide: UserService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: RoleService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  it('signs only account identity and session version after verifying the password', async () => {
    await expect(service.login({ email: 'qa@example.invalid', password: 'ValidTest123!' })).resolves.toEqual({ access_token: 'signed-test-token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7, sv: 3 });
  });
  it.each([null, { isActive: false, password: 'unused' }])('does not issue tokens for unavailable accounts: %j', async user => {
    users.findForLogin.mockResolvedValue(user);
    await expect(service.login({ email: 'qa@example.invalid', password: 'ValidTest123!' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('does not issue a token for an incorrect password', async () => {
    await expect(service.login({ email: 'qa@example.invalid', password: 'WrongTest123!' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
