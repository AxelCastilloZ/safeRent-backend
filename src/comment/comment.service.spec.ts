import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommentService } from './comment.service';
import { Property } from '../property/entities/property.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

describe('Property comments', () => {
  function setup(tenantId: number | null = 2, existing = false, found = true) {
    const save = jest.fn().mockImplementation((comment: object) => ({ ...comment, id: 1, createdAt: new Date() }));
    const builder = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(found ? { id: 5, ownerId: 1, reservedTenantId: tenantId } : null) };
    const comments = { findOneBy: jest.fn().mockResolvedValue(existing ? { id: 1 } : null), create: jest.fn().mockImplementation((value: object) => value), save };
    const manager = { getRepository: (entity: unknown) => entity === Property ? { createQueryBuilder: () => builder } : comments };
    const service = new CommentService({ transaction: (work: (m: typeof manager) => unknown) => work(manager) } as unknown as DataSource);
    return { service, save, comments };
  }

  it('links the comment to the authenticated tenant and property', async () => {
    const test = setup();
    const result = await test.service.create(5, 2, { content: 'Buena experiencia' });
    expect(result.content).toBe('Buena experiencia');
    expect(test.comments.create).toHaveBeenCalledWith({ content: 'Buena experiencia', property: { id: 5 }, author: { id: 2 } });
  });

  it('persists the score without accepting an author from the payload', async () => {
    const test = setup();
    const result = await test.service.create(5, 2, { content: 'Buen lugar', rating: 4 });
    expect(result.rating).toBe(4);
    expect(test.comments.create).toHaveBeenCalledWith({ content: 'Buen lugar', rating: 4, property: { id: 5 }, author: { id: 2 } });
  });

  it.each([0, 6, -1, 2.5, '5', true])('rejects invalid score %s', async rating => {
    const errors = await validate(plainToInstance(CreateCommentDto, { content: 'Buen lugar', rating }));
    expect(errors.some(error => error.property === 'rating')).toBe(true);
  });

  it.each([1, 5])('accepts score boundary %s', async rating => {
    expect(await validate(plainToInstance(CreateCommentDto, { content: 'Buen lugar', rating }))).toHaveLength(0);
  });

  it('requests only visible comments and exposes their score without private author fields', async () => {
    const find = jest.fn().mockResolvedValue([{ id: 1, content: 'Buen lugar', rating: 5, createdAt: new Date(), author: { id: 2, name: 'José', email: 'private@example.test' } }]);
    const service = new CommentService({ getRepository: (entity: unknown) => entity === Property
      ? { findOneBy: jest.fn().mockResolvedValue({ id: 5 }) } : { find },
    } as unknown as DataSource);
    const result = await service.findByProperty(5);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { property: { id: 5 }, hidden: false }, select: expect.objectContaining({ rating: true }) }));
    expect(result[0]).toMatchObject({ rating: 5, author: { id: 2, name: 'José' } });
    expect(result[0].author).not.toHaveProperty('email');
  });

  it.each([1, 3])('rejects user %s who is not the linked tenant', async (userId) => {
    const test = setup();
    await expect(test.service.create(5, userId, { content: 'Texto' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('rejects a property without a reservation', async () => {
    const test = setup(null);
    await expect(test.service.create(5, 2, { content: 'Texto' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects duplicate comments', async () => {
    const test = setup(2, true);
    await expect(test.service.create(5, 2, { content: 'Texto' })).rejects.toBeInstanceOf(ConflictException);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('rejects a missing property', async () => {
    const test = setup(2, false, false);
    await expect(test.service.create(5, 2, { content: 'Texto' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('trims text and rejects empty or oversized comments', async () => {
    const valid = plainToInstance(CreateCommentDto, { content: '  Buen lugar  ' });
    expect(valid.content).toBe('Buen lugar');
    expect(await validate(valid)).toHaveLength(0);
    expect((await validate(plainToInstance(CreateCommentDto, { content: '   ' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(CreateCommentDto, { content: 'a'.repeat(1001) }))).length).toBeGreaterThan(0);
  });
});
