import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource } from 'typeorm';
import { ProfileService } from './profile.service';
import { UpdateCurrencyDto } from './dto/currency.dto';

describe('Navigation currency preference', () => {
  const update = jest.fn();
  const service = new ProfileService({ getRepository: () => ({ update }) } as unknown as DataSource);
  beforeEach(() => { update.mockReset(); update.mockResolvedValue({ affected: 1 }); });

  it('updates only the currency of the active authenticated account', async () => {
    expect(await service.updateCurrency(7, 'USD')).toEqual({ preferredCurrency: 'USD', resolvedCurrency: 'USD', currencySource: 'preference' });
    expect(update).toHaveBeenCalledWith({ id: 7, isActive: true }, { preferredCurrency: 'USD' });
  });
  it('rejects unsupported currencies before writing', async () => {
    await expect(service.updateCurrency(7, 'BTC')).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects missing or inactive accounts', async () => {
    update.mockResolvedValue({ affected: 0 });
    await expect(service.updateCurrency(7, 'EUR')).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([undefined, null, '', 'BTC', 123])('rejects malformed preference %s', async preferredCurrency => {
    expect(await validate(plainToInstance(UpdateCurrencyDto, { preferredCurrency }))).not.toHaveLength(0);
  });
});
