import type { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ProfileService } from './profile.service';
import { User } from '../user/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import type { UpdateProfileDto } from './dto/profile.dto';

const dto: UpdateProfileDto = { name: 'Jose', surname1: 'Perez', surname2: '', email: 'stored@example.com', phoneNumber: '88888888', birthdate: new Date('2000-01-01') };
function fixture() {
  const user: any = { id: 7, idCard: '001234567', ...dto, sessionVersion: 3, isActive: true, createdAt: new Date(), Roles: [{ name: 'CLIENT', isActive: true }] };
  const query: any = { addSelect: jest.fn(), where: jest.fn(), setLock: jest.fn(), getOne: jest.fn() };
  for (const name of ['addSelect','where','setLock']) query[name].mockReturnValue(query);
  query.getOne.mockResolvedValue(user);
  const repo: any = { createQueryBuilder: () => query, findOne: jest.fn().mockResolvedValue(user) };
  const manager: any = { getRepository: () => repo, update: jest.fn() };
  const db: any = { getRepository: () => repo, query: jest.fn().mockResolvedValue([{ count: 1 }]), transaction: (fn: any) => fn(manager) };
  return { user, repo, query, manager, service: new ProfileService(db as DataSource), db };
}
describe('Self-service account security', () => {
  it('never exposes password hash or session security fields', async () => {
    const { service, user } = fixture(); user.password = 'hash';
    const result = await service.get(7);
    expect(result.idCard).toBe('001234567');
    for (const key of ['password','sessionVersion','passwordChangedAt']) expect(result).not.toHaveProperty(key);
  });
  it('updates only allowed personal fields', async () => {
    const { service, manager } = fixture();
    await service.update(7, { ...dto, roleId: 1, idCard: 'injected' } as UpdateProfileDto);
    expect(manager.update).toHaveBeenCalledWith(User, 7, expect.objectContaining({ name: dto.name }));
    const fields = manager.update.mock.calls[0][2];
    expect(fields.roleId).toBeUndefined(); expect(fields.idCard).toBeUndefined();
  });
  it('requires the current password when changing the recovery email', async () => {
    const { service, manager } = fixture();
    await expect(service.update(7, { ...dto, email: 'other@example.com' })).rejects.toMatchObject({ status: 400 });
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('rejects a duplicate email even after password confirmation', async () => {
    const { service, user, query, manager } = fixture(); user.password = await bcrypt.hash('Current123!', 10);
    query.getOne.mockResolvedValueOnce(user).mockResolvedValueOnce({ id: 8 });
    await expect(service.update(7, { ...dto, email: 'other@example.com', currentPassword: 'Current123!' })).rejects.toMatchObject({ status: 409 });
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('rejects the wrong current password without changing any data', async () => {
    const { service, user, manager } = fixture(); user.password = await bcrypt.hash('Current123!', 10);
    await expect(service.changePassword(7, { currentPassword: 'wrong', password: 'NewPassword123!' })).rejects.toMatchObject({ status: 400 });
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('rejects reusing the current password', async () => {
    const { service, user, manager } = fixture(); user.password = await bcrypt.hash('Current123!', 10);
    await expect(service.changePassword(7, { currentPassword: 'Current123!', password: 'Current123!' })).rejects.toMatchObject({ status: 400 });
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('hashes the new password and invalidates sessions and recovery links atomically', async () => {
    const { service, user, manager, query } = fixture(); user.password = await bcrypt.hash('Current123!', 10);
    await service.changePassword(7, { currentPassword: 'Current123!', password: 'NewPassword123!' });
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    const values = manager.update.mock.calls.find(([entity]: any[]) => entity === User)[2];
    expect(await bcrypt.compare('NewPassword123!', values.password)).toBe(true);
    expect(values.sessionVersion).toBe(4);
    expect(manager.update.mock.calls.some(([entity]: any[]) => entity === PasswordResetToken)).toBe(true);
  });
  it('limits repeated account security operations before accessing credentials', async () => {
    const { service, db, query } = fixture(); db.query.mockResolvedValue([{ count: 11 }]);
    await expect(service.changePassword(7, { currentPassword: 'wrong', password: 'NewPassword123!' })).rejects.toMatchObject({ status: 429 });
    expect(query.getOne).not.toHaveBeenCalled();
  });
});
