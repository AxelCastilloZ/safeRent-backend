import { ValidationPipe } from '@nestjs/common';
import { ForgotPasswordDto } from './forgot-password.dto';
import { ResetPasswordDto } from './reset-password.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
describe('Password recovery DTOs', () => {
  it.each(['001234567', 'someone@example.com'])(
    'accepts identifiers %s',
    async (identifier) => {
      const result = await pipe.transform(
        { identifier: ` ${identifier} ` },
        { type: 'body', metatype: ForgotPasswordDto },
      );
      expect(result.identifier).toBe(identifier);
    },
  );
  it.each(['', 'invalid@', 'a'.repeat(31), 123])(
    'rejects invalid identifier %s',
    async (identifier) => {
      await expect(
        pipe.transform(
          { identifier },
          { type: 'body', metatype: ForgotPasswordDto },
        ),
      ).rejects.toThrow();
    },
  );
  it('accepts reset payload but strips confirmation and unrelated properties', async () => {
    const result = await pipe.transform(
      {
        token: 'opaque_token',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        roleId: 1,
      },
      { type: 'body', metatype: ResetPasswordDto },
    );
    expect(Object.keys(result).sort()).toEqual(['password', 'token']);
  });
  it.each(['weak', 'Aa1!' + 'é'.repeat(35)])(
    'rejects weak or over-72-byte passwords',
    async (password) => {
      await expect(
        pipe.transform(
          { token: 'opaque_token', password },
          { type: 'body', metatype: ResetPasswordDto },
        ),
      ).rejects.toThrow();
    },
  );
  it.each(['', '<script>', ['one', 'two']])(
    'rejects malformed tokens %s',
    async (token) => {
      await expect(
        pipe.transform(
          { token, password: 'Password123!' },
          { type: 'body', metatype: ResetPasswordDto },
        ),
      ).rejects.toThrow();
    },
  );
});
