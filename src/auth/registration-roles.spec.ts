import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto';

describe('Public registration roles', () => {
  const account = {
    idCard: '123456789', name: 'Ana', surname1: 'Pérez', email: 'ana@example.com',
    phoneNumber: '88888888', birthdate: '1995-01-01', password: 'ValidPassword1!',
  };
  it.each(['CLIENT', 'OWNER'])('accepts account type %s', async (accountType) => {
    expect(await validate(plainToInstance(RegisterDto, { ...account, accountType }))).toHaveLength(0);
  });
  it('rejects administrator self-registration', async () => {
    const errors = await validate(plainToInstance(RegisterDto, { ...account, accountType: 'ADMIN' }));
    expect(errors.some((error) => error.property === 'accountType')).toBe(true);
  });
  it('strips direct role assignment from registration', async () => {
    const dto = plainToInstance(RegisterDto, { ...account, roleId: 99, roles: ['ADMIN'] });
    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto).not.toHaveProperty('roleId');
    expect(dto).not.toHaveProperty('roles');
  });
});
