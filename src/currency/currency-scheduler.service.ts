import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval } from '@nestjs/schedule';
import { CurrencySyncService } from './currency-sync.service';
import {
  CURRENCY_DAILY_CRON,
  CURRENCY_TIME_ZONE,
} from './currency-sync.policy';

@Injectable()
export class CurrencySchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CurrencySchedulerService.name);
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly sync: CurrencySyncService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.check();
  }

  @Cron(CURRENCY_DAILY_CRON, {
    name: 'currency-daily-sync',
    timeZone: CURRENCY_TIME_ZONE,
    waitForCompletion: true,
  })
  async daily(): Promise<void> {
    await this.check();
  }

  // PostgreSQL decides whether a retry/missed execution is due. This timer
  // checks local data only; it does not itself imply an external API call.
  @Interval('currency-sync-recovery', 60_000)
  async recover(): Promise<void> {
    await this.check();
  }

  async check(): Promise<void> {
    if (
      this.stopping ||
      this.running ||
      this.config.get<string>('CURRENCY_SYNC_ENABLED') === 'false' ||
      !this.config.get<string>('CURRENCY_API_KEY')?.trim()
    ) {
      return;
    }
    this.running = this.execute();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }

  private async execute(): Promise<void> {
    try {
      const result = await this.sync.synchronize({ automatic: true });
      if (result.status === 'succeeded') {
        this.logger.log('Tasas de cambio actualizadas.');
      }
    } catch (error: unknown) {
      let code = 'CURRENCY_AUTOMATIC_SYNC_FAILED';
      if (error instanceof ServiceUnavailableException) {
        const response = error.getResponse();
        if (
          typeof response === 'object' &&
          'code' in response &&
          typeof response.code === 'string' &&
          /^CURRENCY_[A-Z0-9_]+$/.test(response.code)
        ) {
          code = response.code;
        }
      }
      this.logger.warn(code);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.running;
  }
}
