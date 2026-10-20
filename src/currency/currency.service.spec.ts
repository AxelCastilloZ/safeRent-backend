import { BadRequestException } from '@nestjs/common';
import {
  CurrencyRepository,
  type ConversionRates,
} from './currency.repository';
import { CurrencyService } from './currency.service';

describe('Local decimal currency conversions', () => {
  const repository = { findConversionRates: jest.fn() };
  const service = new CurrencyService(
    repository as unknown as CurrencyRepository,
  );
  const snapshot = (patch: Partial<ConversionRates> = {}): ConversionRates => ({
    batchId: 4,
    ratesUpdatedAt: new Date('2026-10-20T06:00:00Z'),
    fromRate: '1.000000000000000',
    toRate: '500.000000000000000',
    stale: false,
    ...patch,
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findConversionRates.mockResolvedValue(snapshot());
  });

  it.each([
    ['10', 'USD', 'CRC', '1', '500', '5000.00'],
    ['250000', 'CRC', 'USD', '500', '1', '500.00'],
    ['100', 'EUR', 'CRC', '0.81', '500', '61728.40'],
    ['0.1', 'USD', 'EUR', '1', '0.2', '0.02'],
    ['1.005', 'USD', 'EUR', '1', '1', '1.01'],
    ['1.005', 'USD', 'JPY', '1', '150', '151'],
    ['10', 'USD', 'KWD', '1', '0.307', '3.070'],
    ['60000', 'CRC', 'USD', '3', '1', '20000.00'],
    ['999999999999999.999999', 'USD', 'EUR', '1', '0.1', '100000000000000.00'],
    ['0', 'USD', 'CRC', '1', '500', '0.00'],
  ])(
    'converts %s %s to %s with final rounding only',
    async (amount, from, to, fromRate, toRate, expected) => {
      repository.findConversionRates.mockResolvedValue(
        snapshot({ fromRate, toRate }),
      );
      const result = await service.convert({ amount, from, to });
      expect(result.converted).toEqual({ amount: expected, currency: to });
      expect(result.original).toEqual({ amount, currency: from });
      expect(result).toMatchObject({
        status: 'converted',
        batchId: 4,
        approximate: true,
        ratesUpdatedAt: '2026-10-20T06:00:00.000Z',
      });
    },
  );

  it('returns the same currency unchanged without accessing PostgreSQL', async () => {
    const result = await service.convert({
      amount: '1.005',
      from: 'crc',
      to: 'CRC',
    });
    expect(result).toMatchObject({
      status: 'unchanged',
      converted: { amount: '1.005', currency: 'CRC' },
      rate: '1',
      approximate: false,
      batchId: null,
    });
    expect(repository.findConversionRates).not.toHaveBeenCalled();
  });

  it('normalizes currency codes before selecting stored rates', async () => {
    await service.convert({ amount: '1', from: ' usd ', to: 'crc' });
    expect(repository.findConversionRates).toHaveBeenCalledWith('USD', 'CRC');
  });

  it.each([
    '-1',
    'NaN',
    'Infinity',
    '1e3',
    '1,000',
    '01',
    ' 1 ',
    '1.0000001',
    '1000000000000000',
  ])('rejects invalid amount %s', async (amount) => {
    await expect(
      service.convert({ amount, from: 'USD', to: 'CRC' }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.findConversionRates).not.toHaveBeenCalled();
  });

  it.each(['ZZZ', 'DOGE', 'XAU', 'XXX'])(
    'rejects unsupported rental code %s',
    async (to) => {
      await expect(
        service.convert({ amount: '1', from: 'USD', to }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.findConversionRates).not.toHaveBeenCalled();
    },
  );

  it('retains the original price when there is no active batch', async () => {
    repository.findConversionRates.mockResolvedValue(null);
    expect(
      await service.convert({ amount: '10.00', from: 'USD', to: 'CRC' }),
    ).toMatchObject({
      status: 'unavailable',
      original: { amount: '10.00', currency: 'USD' },
      converted: null,
      reason: 'CURRENCY_RATES_UNAVAILABLE',
    });
  });

  it.each([{ fromRate: null }, { toRate: null }])(
    'never invents a missing rate',
    async (patch) => {
      repository.findConversionRates.mockResolvedValue(snapshot(patch));
      expect(
        await service.convert({ amount: '10', from: 'USD', to: 'CRC' }),
      ).toMatchObject({
        status: 'unavailable',
        batchId: 4,
        converted: null,
        reason: 'CURRENCY_RATE_MISSING',
      });
    },
  );

  it('keeps the last valid rates usable while marking them stale', async () => {
    repository.findConversionRates.mockResolvedValue(snapshot({ stale: true }));
    expect(
      await service.convert({ amount: '10', from: 'USD', to: 'CRC' }),
    ).toMatchObject({ status: 'converted', stale: true, approximate: true });
  });

  it('falls back to the original amount on database failure without leaking errors', async () => {
    repository.findConversionRates.mockRejectedValue(
      new Error('private connection details'),
    );
    expect(
      await service.convert({ amount: '10', from: 'USD', to: 'CRC' }),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'CURRENCY_STORAGE_UNAVAILABLE',
      converted: null,
    });
  });

  it('rejects a zero stored denominator', async () => {
    repository.findConversionRates.mockResolvedValue(
      snapshot({ fromRate: '0' }),
    );
    expect(
      await service.convert({ amount: '10', from: 'USD', to: 'CRC' }),
    ).toHaveProperty('reason', 'CURRENCY_INVALID_STORED_RATE');
  });
});
