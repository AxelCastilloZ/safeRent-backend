import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { ServiceService } from './service.service';
import { Service } from './entities/service.entity';

describe('Service catalog', () => {
  const water = {
    id: 1,
    name: 'Agua',
    icono: 'droplet',
    description: 'Agua potable',
  };
  const databaseError = (code: string) =>
    new QueryFailedError(
      'query',
      [],
      Object.assign(new Error('database error'), { code }),
    );
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getExists: jest.fn(),
  };
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    merge: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  let service: ServiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.create.mockImplementation((data: object) => ({ ...data }));
    repo.save.mockImplementation((data: object) =>
      Promise.resolve({ id: 1, ...data }),
    );
    repo.findOneBy.mockResolvedValue({ ...water });
    repo.merge.mockImplementation((target: object, data: object) =>
      Object.assign(target, data),
    );
    repo.createQueryBuilder.mockReturnValue(query);
    query.getExists.mockResolvedValue(false);
    service = new ServiceService(repo as unknown as Repository<Service>);
  });

  it('persists the catalog attributes', async () => {
    await expect(
      service.create({
        name: 'Agua',
        icono: 'droplet',
        description: 'Agua potable',
      }),
    ).resolves.toEqual(water);
    expect(repo.save).toHaveBeenCalled();
  });
  it('returns an ordered empty catalog', async () => {
    repo.find.mockResolvedValue([]);
    await expect(service.findAll()).resolves.toEqual([]);
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });
  it('updates one attribute without losing the others', async () => {
    await expect(
      service.update(1, { description: 'Suministro continuo' }),
    ).resolves.toEqual({ ...water, description: 'Suministro continuo' });
  });
  it('returns 404 for missing entries', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(99, { name: 'Agua' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each(['create', 'update'])(
    'returns 409 for duplicate name on %s',
    async (method) => {
      repo.save.mockRejectedValueOnce(databaseError('23505'));
      const result =
        method === 'create'
          ? service.create({ name: 'Agua' })
          : service.update(1, { name: 'Agua' });
      await expect(result).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('does not hide unexpected persistence failures', async () => {
    const error = new Error('Connection lost');
    repo.save.mockRejectedValueOnce(error);
    await expect(service.create({ name: 'Agua' })).rejects.toBe(error);
  });
  it('resolves an empty selection without a query', async () => {
    await expect(service.findByIds([])).resolves.toEqual([]);
    expect(repo.findBy).not.toHaveBeenCalled();
  });
  it('resolves selected entries', async () => {
    repo.findBy.mockResolvedValue([water]);
    await expect(service.findByIds([1])).resolves.toEqual([water]);
  });
  it('rejects the whole selection when any ID is missing', async () => {
    repo.findBy.mockResolvedValue([water]);
    await expect(service.findByIds([1, 99])).rejects.toThrow(
      'Services not found: 99',
    );
  });
  it('does not delete an entry used by a property', async () => {
    query.getExists.mockResolvedValue(true);
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.remove).not.toHaveBeenCalled();
  });
  it('handles an assignment made concurrently with deletion', async () => {
    repo.remove.mockRejectedValueOnce(databaseError('23503'));
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
  });
  it('deletes unused entries', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(water);
  });
});
