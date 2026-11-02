import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { RecordViewDto } from './dto/record-view.dto';
import { PropertyViewService } from './property-view.service';

describe('PropertyViewService', () => {
  const existsBy = jest.fn();
  const query = jest.fn();
  const dataSource = { getRepository: (entity: unknown) => (entity === Property ? { existsBy } : undefined), query } as unknown as DataSource;
  const service = new PropertyViewService(dataSource);

  beforeEach(() => jest.resetAllMocks());

  it('does not exist for the public when the property is not published', async () => {
    existsBy.mockResolvedValue(false);
    await expect(service.record(5, 'a'.repeat(20))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.views(5)).rejects.toBeInstanceOf(NotFoundException);
    expect(existsBy).toHaveBeenCalledWith({ id: 5, status: PropertyStatus.ACTIVE });
    expect(query).not.toHaveBeenCalled();
  });

  it('records one row per person and property in a single statement, then returns the total', async () => {
    existsBy.mockResolvedValue(true);
    query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ views: 7 }]);

    const result = await service.record(5, 'visitor-abcdefghijkl');

    expect(result).toEqual({ propertyId: 5, views: 7 });
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("propertyId", "visitorId") DO UPDATE');
    expect(query.mock.calls[0][1]).toEqual([5, 'visitor-abcdefghijkl']);
  });

  it('counts without recording', async () => {
    existsBy.mockResolvedValue(true);
    query.mockResolvedValueOnce([{ views: 3 }]);
    expect(await service.views(5)).toEqual({ propertyId: 5, views: 3 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('SELECT count(*)');
  });
});

describe('RecordViewDto', () => {
  const check = async (visitorId: unknown) => (await validate(plainToInstance(RecordViewDto, { visitorId }))).length;

  it('accepts an anonymous code and rejects anything else', async () => {
    expect(await check('3f9c1a2e-7b4d-4c1e-9a55-0d7e8f2b6c11')).toBe(0);
    expect(await check('short')).toBeGreaterThan(0);
    expect(await check('x'.repeat(65))).toBeGreaterThan(0);
    expect(await check('has spaces in the middle of it')).toBeGreaterThan(0);
    expect(await check("'; DROP TABLE property;--aaaaaaaa")).toBeGreaterThan(0);
    expect(await check(undefined)).toBeGreaterThan(0);
  });
});
