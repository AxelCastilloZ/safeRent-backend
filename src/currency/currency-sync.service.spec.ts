import { ServiceUnavailableException } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { CurrencyApiClient, CurrencySyncError } from './currency-api.client';
import { CurrencyRepository } from './currency.repository';
import { CurrencySyncService } from './currency-sync.service';

describe('Manual currency synchronization', () => {
  const runner = {} as QueryRunner;
  const repository = {
    withSyncLock: jest.fn(),
    inCooldown: jest.fn(),
    startRun: jest.fn(),
    saveSnapshot: jest.fn(),
    finishRun: jest.fn(),
    automaticDecision: jest.fn(),
  };
  const client = { fetchSnapshot: jest.fn() };
  const service = new CurrencySyncService(
    repository as unknown as CurrencyRepository,
    client as unknown as CurrencyApiClient,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.withSyncLock.mockImplementation(
      (work: (runner: QueryRunner) => Promise<unknown>) => work(runner),
    );
    repository.inCooldown.mockResolvedValue(false);
    repository.automaticDecision.mockResolvedValue({ due: true });
    repository.startRun.mockResolvedValue(7);
    repository.finishRun.mockResolvedValue(undefined);
    repository.saveSnapshot.mockResolvedValue({
      status: 'succeeded',
      batchId: 3,
    });
    client.fetchSnapshot.mockResolvedValue({ rates: { USD: '1', CRC: '500' } });
  });

  it('does not consume API quota if another instance is synchronizing', async () => {
    repository.withSyncLock.mockResolvedValue(null);
    expect(await service.synchronize()).toEqual({
      status: 'skipped',
      reason: 'CURRENCY_SYNC_IN_PROGRESS',
    });
    expect(client.fetchSnapshot).not.toHaveBeenCalled();
  });

  it('does not consume API quota during the shared cooldown', async () => {
    repository.inCooldown.mockResolvedValue(true);
    expect(await service.synchronize()).toHaveProperty(
      'reason',
      'CURRENCY_SYNC_COOLDOWN',
    );
    expect(client.fetchSnapshot).not.toHaveBeenCalled();
    expect(repository.startRun).not.toHaveBeenCalled();
  });

  it('downloads once and persists the validated snapshot', async () => {
    expect(await service.synchronize()).toEqual({
      status: 'succeeded',
      batchId: 3,
    });
    expect(client.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.saveSnapshot).toHaveBeenCalledWith(
      runner,
      7,
      await client.fetchSnapshot.mock.results[0].value,
    );
  });

  it('checks the durable policy under the lock before automatic API calls', async () => {
    repository.automaticDecision.mockResolvedValue({
      due: false,
      reason: 'CURRENCY_UP_TO_DATE',
    });
    await expect(
      service.synchronize({ automatic: true }),
    ).resolves.toHaveProperty('reason', 'CURRENCY_UP_TO_DATE');
    expect(repository.automaticDecision).toHaveBeenCalledWith(runner);
    expect(client.fetchSnapshot).not.toHaveBeenCalled();
    expect(repository.startRun).not.toHaveBeenCalled();
  });

  it('allows explicit manual recovery even when automatic retries are exhausted', async () => {
    repository.automaticDecision.mockResolvedValue({
      due: false,
      reason: 'CURRENCY_DAILY_ATTEMPTS_EXHAUSTED',
    });
    expect(await service.synchronize()).toHaveProperty('status', 'succeeded');
    expect(repository.automaticDecision).not.toHaveBeenCalled();
  });

  it('records provider failure without replacing any rates', async () => {
    client.fetchSnapshot.mockRejectedValue(
      new CurrencySyncError('CURRENCY_HTTP_429'),
    );
    await expect(service.synchronize()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
    expect(repository.finishRun).toHaveBeenCalledWith(
      runner,
      7,
      'failed',
      null,
      'CURRENCY_HTTP_429',
    );
  });

  it('sanitizes unexpected storage errors', async () => {
    repository.saveSnapshot.mockRejectedValue(new Error('private DB details'));
    try {
      await service.synchronize();
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        message:
          'No se pudieron actualizar las tasas. Se conserva el último lote válido.',
        code: 'CURRENCY_STORAGE_FAILED',
      });
    }
  });
});
