import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { CurrencySchedulerService } from './currency-scheduler.service';
import { CurrencySyncService } from './currency-sync.service';

describe('Currency scheduler lifecycle', () => {
  const sync = { synchronize: jest.fn() };
  let scheduler: CurrencySchedulerService;

  beforeEach(() => {
    jest.resetAllMocks();
    sync.synchronize.mockResolvedValue({
      status: 'skipped',
      reason: 'CURRENCY_UP_TO_DATE',
    });
    scheduler = new CurrencySchedulerService(
      sync as unknown as CurrencySyncService,
      new ConfigService({ CURRENCY_API_KEY: 'test-key' }),
    );
  });

  it('checks for a missed execution on startup and through the recovery timer', async () => {
    await scheduler.onApplicationBootstrap();
    await scheduler.recover();
    expect(sync.synchronize).toHaveBeenCalledTimes(2);
    expect(sync.synchronize).toHaveBeenCalledWith({ automatic: true });
  });

  it.each([
    { CURRENCY_SYNC_ENABLED: 'false', CURRENCY_API_KEY: 'test-key' },
    {},
  ])('skips automatically when disabled or missing its key', async (config) => {
    scheduler = new CurrencySchedulerService(
      sync as unknown as CurrencySyncService,
      new ConfigService(config),
    );
    await scheduler.onApplicationBootstrap();
    await scheduler.daily();
    await scheduler.recover();
    expect(sync.synchronize).not.toHaveBeenCalled();
  });

  it('does not overlap checks and waits for the active check at shutdown', async () => {
    let finish!: (value: unknown) => void;
    sync.synchronize.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = scheduler.check();
    await scheduler.daily();
    expect(sync.synchronize).toHaveBeenCalledTimes(1);
    const shutdown = scheduler.onModuleDestroy();
    finish({ status: 'succeeded' });
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await Promise.all([pending, shutdown]);
    await scheduler.recover();
    expect(sync.synchronize).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('logs only sanitized codes and keeps running after an error', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    sync.synchronize.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'CURRENCY_HTTP_503',
        private: 'key=test-key',
      }),
    );
    await scheduler.check();
    expect(warn).toHaveBeenCalledWith('CURRENCY_HTTP_503');
    await scheduler.check();
    expect(sync.synchronize).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('registers the actual cron at midnight Costa Rica time', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-20T18:00:00Z') });
    const module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        CurrencySchedulerService,
        { provide: CurrencySyncService, useValue: sync },
        {
          provide: ConfigService,
          useValue: new ConfigService({ CURRENCY_API_KEY: 'test-key' }),
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      const registry = app.get(SchedulerRegistry);
      expect(
        registry
          .getCronJob('currency-daily-sync')
          .nextDate()
          .toJSDate()
          .toISOString(),
      ).toBe('2026-10-21T06:00:00.000Z');
      expect(registry.getInterval('currency-sync-recovery')).toBeDefined();
      await registry.getCronJob('currency-daily-sync').fireOnTick();
      expect(sync.synchronize).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
      jest.useRealTimers();
    }
  });
});
