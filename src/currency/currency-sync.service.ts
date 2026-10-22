import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CurrencyApiClient, CurrencySyncError } from './currency-api.client';
import { CurrencyRepository } from './currency.repository';

@Injectable()
export class CurrencySyncService {
  constructor(
    private readonly repository: CurrencyRepository,
    private readonly client: CurrencyApiClient,
  ) {}

  getStatus() {
    return this.repository.getStatus();
  }

  async synchronize(options: { automatic?: boolean } = {}) {
    try {
      const result = await this.repository.withSyncLock(async (runner) => {
        if (options.automatic) {
          const decision = await this.repository.automaticDecision(runner);
          if (!decision.due) {
            return { status: 'skipped' as const, reason: decision.reason };
          }
        }
        if (await this.repository.inCooldown(runner)) {
          return {
            status: 'skipped' as const,
            reason: 'CURRENCY_SYNC_COOLDOWN',
          };
        }
        const runId = await this.repository.startRun(runner);
        try {
          const snapshot = await this.client.fetchSnapshot();
          return await this.repository.saveSnapshot(runner, runId, snapshot);
        } catch (error: unknown) {
          const code =
            error instanceof CurrencySyncError
              ? error.code
              : 'CURRENCY_STORAGE_FAILED';
          await this.repository.finishRun(runner, runId, 'failed', null, code);
          // Return the failure so the outer transaction commits the audit entry.
          return { status: 'failed' as const, code };
        }
      });
      if (result?.status === 'failed') throw new CurrencySyncError(result.code);
      return (
        result ?? {
          status: 'skipped' as const,
          reason: 'CURRENCY_SYNC_IN_PROGRESS',
        }
      );
    } catch (error: unknown) {
      throw new ServiceUnavailableException({
        message:
          'No se pudieron actualizar las tasas. Se conserva el último lote válido.',
        code:
          error instanceof CurrencySyncError
            ? error.code
            : 'CURRENCY_STORAGE_FAILED',
      });
    }
  }
}
