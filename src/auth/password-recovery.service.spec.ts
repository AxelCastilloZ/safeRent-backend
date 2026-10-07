import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  PasswordRecoveryService,
  RECOVERY_MESSAGE,
} from './password-recovery.service';
import {
  BrevoDeliveryError,
  BrevoMailService,
} from '../mail/brevo-mail.service';
import {
  PasswordResetToken,
  PasswordRecoveryJob,
} from './entities/password-reset-token.entity';
import { User } from '../user/entities/user.entity';

function setup() {
  const jobs = {
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  };
  const tokens = { countBy: jest.fn().mockResolvedValue(0), save: jest.fn() };
  const query: any = {
    where: jest.fn(),
    andWhere: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    setLock: jest.fn(),
    setOnLocked: jest.fn(),
    getOne: jest.fn(),
  };
  for (const name of [
    'where',
    'andWhere',
    'addSelect',
    'orderBy',
    'setLock',
    'setOnLocked',
  ])
    query[name].mockReturnValue(query);
  jobs.createQueryBuilder.mockReturnValue(query);
  const userQuery = { ...query, getOne: jest.fn() };
  for (const name of ['where', 'andWhere', 'addSelect', 'setLock'])
    userQuery[name] = jest.fn().mockReturnValue(userQuery);
  const manager: any = {
    query: jest.fn().mockResolvedValue([{ count: 1 }]),
    save: jest.fn(),
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    getRepository: jest.fn((entity) =>
      entity === PasswordRecoveryJob
        ? jobs
        : entity === PasswordResetToken
          ? tokens
          : { createQueryBuilder: () => userQuery },
    ),
  };
  const db: any = {
    transaction: jest.fn((callback) => callback(manager)),
    getRepository: jest.fn(),
    query: jest.fn(),
  };
  const mail = { ttlMinutes: 15, sendPasswordReset: jest.fn() };
  const service = new PasswordRecoveryService(
    db as DataSource,
    new ConfigService({ PASSWORD_RECOVERY_ENCRYPTION_KEY: 'ab'.repeat(32) }),
    mail as unknown as BrevoMailService,
  );
  (service as any).lastCleanup = Date.now();
  return { service, manager, db, mail, jobs, tokens, query, userQuery };
}

describe('Password recovery lifecycle', () => {
  it('queues encrypted identifiers and returns a non-enumerating response', async () => {
    const { service, manager } = setup();
    await expect(service.request('001234567', '127.0.0.1')).resolves.toEqual({
      message: RECOVERY_MESSAGE,
    });
    const job = manager.save.mock.calls[0][1];
    expect(job.payload).not.toContain('001234567');
    expect(manager.findOne).not.toHaveBeenCalled();
  });
  it('limits repeated requests without queuing another message', async () => {
    const { service, manager } = setup();
    manager.query.mockResolvedValue([{ count: 99 }]);
    await expect(service.request('a@example.com', 'ip')).rejects.toMatchObject({
      status: 429,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('changes the password and revokes all reset tokens and sessions', async () => {
    const { service, manager } = setup();
    manager.findOneBy.mockResolvedValue({ id: 2, userId: 1 });
    manager.findOne.mockImplementation((entity) =>
      Promise.resolve(
        entity === User
          ? { id: 1, isActive: true, sessionVersion: 4 }
          : { id: 2, usedAt: null, expiresAt: new Date(Date.now() + 60000) },
      ),
    );
    await expect(
      service.reset({ token: 'token', password: 'Password123!' }, 'ip'),
    ).resolves.toEqual({ message: 'Contraseña actualizada correctamente.' });
    const update = manager.update.mock.calls.find(
      ([entity, , changes]) => entity === User && changes.password,
    )[2];
    expect(update.sessionVersion).toBe(5);
    expect(await bcrypt.compare('Password123!', update.password)).toBe(true);
    expect(
      manager.update.mock.calls.some(
        ([entity]) => entity === PasswordResetToken,
      ),
    ).toBe(true);
  });
  it.each(['missing', 'expired', 'used', 'inactive'])(
    'rejects %s tokens without updating password',
    async (kind) => {
      const { service, manager } = setup();
      manager.findOneBy.mockResolvedValue(
        kind === 'missing' ? null : { id: 2, userId: 1 },
      );
      manager.findOne.mockImplementation((entity) =>
        Promise.resolve(
          entity === User
            ? { id: 1, isActive: kind !== 'inactive', sessionVersion: 0 }
            : {
                usedAt: kind === 'used' ? new Date() : null,
                expiresAt: new Date(
                  Date.now() + (kind === 'expired' ? -1 : 60000),
                ),
              },
        ),
      );
      await expect(
        service.reset({ token: 'token', password: 'Password123!' }, 'ip'),
      ).rejects.toMatchObject({ status: 400 });
      expect(manager.update).not.toHaveBeenCalled();
    },
  );
  it.each(['001234567', 'input@example.com'])(
    'sends only to the account email and persists only a token hash (%s)',
    async (identifier) => {
      const { service, manager, query, userQuery, mail, tokens, jobs } =
        setup();
      await service.request(identifier, 'ip');
      query.getOne.mockResolvedValue({
        id: 5,
        ...manager.save.mock.calls[0][1],
        createdAt: new Date(),
        attempts: 0,
      });
      userQuery.getOne.mockResolvedValue({
        id: 1,
        email: 'stored@example.com',
        passwordChangedAt: null,
      });
      await service.processQueue();
      expect(mail.sendPasswordReset.mock.calls[0][0]).toBe(
        'stored@example.com',
      );
      const raw = mail.sendPasswordReset.mock.calls[0][1];
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(tokens.save.mock.calls[0][0].tokenHash).toHaveLength(64);
      expect(JSON.stringify(tokens.save.mock.calls)).not.toContain(raw);
      expect(jobs.delete).toHaveBeenCalledWith(5);
    },
  );
  it('does not send for an unknown account', async () => {
    const { service, manager, query, userQuery, mail } = setup();
    await service.request('missing@example.com', 'ip');
    query.getOne.mockResolvedValue({
      id: 5,
      ...manager.save.mock.calls[0][1],
      createdAt: new Date(),
    });
    userQuery.getOne.mockResolvedValue(null);
    await service.processQueue();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });
  it('retries transient Brevo failures without storing a reset token', async () => {
    const { service, manager, query, userQuery, mail, jobs, tokens } = setup();
    await service.request('a@example.com', 'ip');
    query.getOne.mockResolvedValue({
      id: 5,
      ...manager.save.mock.calls[0][1],
      createdAt: new Date(),
      attempts: 0,
    });
    userQuery.getOne.mockResolvedValue({ id: 1, email: 'stored@example.com' });
    mail.sendPasswordReset.mockRejectedValue(new BrevoDeliveryError(true, 503));
    await service.processQueue();
    expect(jobs.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ attempts: 1 }),
    );
    expect(tokens.save).not.toHaveBeenCalled();
  });
});
