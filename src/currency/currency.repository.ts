import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { CurrencyRates1792454400000 } from '../migrations/1792454400000-currency-rates';
import { CurrencyProviderCodes1792454400001 } from '../migrations/1792454400001-currency-provider-codes';
import type { CurrencySnapshot } from './currency-api.client';
import {
  decideAutomaticSync,
  type AutomaticSyncState,
} from './currency-sync.policy';

const SYNC_LOCK = 1792454400;
const SCHEMA_LOCK = 1792454401;

export interface StoredBatch {
  id: number;
  providerUpdatedAt: Date;
  fetchedAt: Date;
}

export interface ConversionRates {
  batchId: number;
  ratesUpdatedAt: Date;
  fromRate: string | null;
  toRate: string | null;
  stale: boolean;
}

export interface SyncRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  batchId: number | null;
  errorCode: string | null;
}

export interface RateSnapshot {
  batchId: number;
  ratesUpdatedAt: Date;
  rates: Record<string, string>;
  stale: boolean;
}

export interface CurrencyStatus {
  activeBatch: {
    id: number;
    provider: string;
    baseCurrency: string;
    providerUpdatedAt: string;
    fetchedAt: string;
    currencyCount: number;
    stale: boolean;
  } | null;
  lastRun: SyncRun | null;
}

@Injectable()
export class CurrencyRepository implements OnModuleInit {
  constructor(private readonly db: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.options.synchronize) return;
    // These SQL-managed tables have no auto-synchronized entities. This preserves
    // the migration's partial index and constraints in development as well.
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK]);
      await new CurrencyRates1792454400000().up(manager.queryRunner!);
      await new CurrencyProviderCodes1792454400001().up(manager.queryRunner!);
    });
  }

  async withSyncLock<T>(
    work: (runner: QueryRunner) => Promise<T>,
  ): Promise<T | null> {
    const runner = this.db.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      const rows = (await runner.query(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [SYNC_LOCK],
      )) as { locked: boolean }[];
      const result = rows[0].locked ? await work(runner) : null;
      await runner.commitTransaction();
      return result;
    } catch (error: unknown) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async inCooldown(runner: QueryRunner): Promise<boolean> {
    const rows = (await runner.query(`SELECT EXISTS (
      SELECT 1 FROM currency_sync_runs
      WHERE "startedAt" > now() - interval '60 seconds'
    ) AS recent`)) as { recent: boolean }[];
    return rows[0].recent;
  }

  async startRun(runner: QueryRunner): Promise<number> {
    const rows = (await runner.query(
      'INSERT INTO currency_sync_runs DEFAULT VALUES RETURNING id',
    )) as { id: number }[];
    return rows[0].id;
  }

  async automaticDecision(runner: QueryRunner) {
    const rows = (await runner.query(`WITH day_window AS (
      SELECT date_trunc('day', now() AT TIME ZONE 'America/Costa_Rica')
        AT TIME ZONE 'America/Costa_Rica' AS start
    )
    SELECT now() AS now,
      (SELECT count(*)::integer FROM currency_sync_runs
        WHERE "startedAt" >= w.start) AS attempts,
      EXISTS (SELECT 1 FROM currency_sync_runs
        WHERE "finishedAt" >= w.start AND (status = 'succeeded'
          OR (status = 'skipped' AND "errorCode" = 'CURRENCY_UNCHANGED'))
      ) AS "confirmedToday",
      (SELECT "providerUpdatedAt" FROM exchange_rate_batches
        WHERE "isActive" = true) AS "providerUpdatedAt",
      latest.status AS "lastStatus", latest."errorCode" AS "lastErrorCode",
      latest."finishedAt" AS "lastFinishedAt"
    FROM day_window w LEFT JOIN LATERAL (
      SELECT status, "errorCode", "finishedAt" FROM currency_sync_runs
      WHERE "startedAt" >= w.start ORDER BY id DESC LIMIT 1
    ) latest ON true`)) as AutomaticSyncState[];
    return decideAutomaticSync(rows[0]);
  }

  async finishRun(
    runner: QueryRunner,
    id: number,
    status: 'succeeded' | 'failed' | 'skipped',
    batchId: number | null,
    errorCode: string | null,
  ): Promise<void> {
    await runner.query(
      `UPDATE currency_sync_runs SET status = $2, "batchId" = $3,
       "errorCode" = $4, "finishedAt" = clock_timestamp() WHERE id = $1`,
      [id, status, batchId, errorCode],
    );
  }

  async saveSnapshot(
    runner: QueryRunner,
    runId: number,
    snapshot: CurrencySnapshot,
  ): Promise<{ status: 'succeeded' | 'skipped'; batchId: number }> {
    await runner.startTransaction();
    try {
      const latest = (await runner.query(`SELECT id, "providerUpdatedAt"
        FROM exchange_rate_batches ORDER BY "providerUpdatedAt" DESC LIMIT 1`)) as StoredBatch[];
      if (
        latest[0] &&
        latest[0].providerUpdatedAt.getTime() >= snapshot.updatedAt.getTime()
      ) {
        const unchanged =
          latest[0].providerUpdatedAt.getTime() ===
          snapshot.updatedAt.getTime();
        await this.finishRun(
          runner,
          runId,
          'skipped',
          latest[0].id,
          unchanged ? 'CURRENCY_UNCHANGED' : 'CURRENCY_OUTDATED_RESPONSE',
        );
        await runner.commitTransaction();
        return { status: 'skipped', batchId: latest[0].id };
      }

      const rows = (await runner.query(
        `INSERT INTO exchange_rate_batches ("providerUpdatedAt")
         VALUES ($1) RETURNING id`,
        [snapshot.updatedAt],
      )) as { id: number }[];
      const batchId = rows[0].id;
      // One parameterized insert for all rates; strings preserve NUMERIC values.
      await runner.query(
        `INSERT INTO exchange_rates ("batchId", "currencyCode", rate)
         SELECT $1, entry.key, entry.value::numeric
         FROM jsonb_each_text($2::jsonb) AS entry`,
        [batchId, JSON.stringify(snapshot.rates)],
      );
      await runner.query(
        'UPDATE exchange_rate_batches SET "isActive" = false WHERE "isActive" = true',
      );
      await runner.query(
        'UPDATE exchange_rate_batches SET "isActive" = true WHERE id = $1',
        [batchId],
      );
      await this.finishRun(runner, runId, 'succeeded', batchId, null);
      await runner.commitTransaction();
      return { status: 'succeeded', batchId };
    } catch (error: unknown) {
      await runner.rollbackTransaction();
      throw error;
    }
  }

  async getRateSnapshot(batchId?: number): Promise<RateSnapshot | null> {
    const rows = await this.db.query<RateSnapshot[]>(
      `SELECT b.id AS "batchId", b."providerUpdatedAt" AS "ratesUpdatedAt",
        b."providerUpdatedAt" < now() - interval '48 hours' AS stale,
        COALESCE((SELECT jsonb_object_agg(r."currencyCode", r.rate::text)
          FROM exchange_rates r WHERE r."batchId" = b.id), '{}'::jsonb) AS rates
       FROM exchange_rate_batches b
       WHERE ($1::integer IS NULL AND b."isActive" = true) OR b.id = $1`,
      [batchId ?? null],
    );
    return rows[0] ?? null;
  }

  async getStatus() {
    // A single statement keeps the summary on one database snapshot.
    const rows = await this.db.query<CurrencyStatus[]>(`SELECT
      (SELECT row_to_json(b) FROM (
        SELECT id, provider, "baseCurrency", "providerUpdatedAt", "fetchedAt",
          (SELECT count(*)::integer FROM exchange_rates r WHERE r."batchId" = b.id) AS "currencyCount",
          "providerUpdatedAt" < now() - interval '48 hours' AS stale
        FROM exchange_rate_batches b WHERE "isActive" = true
      ) b) AS "activeBatch",
      (SELECT row_to_json(r) FROM (
        SELECT id, "startedAt", "finishedAt", status, "batchId", "errorCode"
        FROM currency_sync_runs ORDER BY id DESC LIMIT 1
      ) r) AS "lastRun"`);
    return rows[0];
  }

  async findConversionRates(
    from: string,
    to: string,
  ): Promise<ConversionRates | null> {
    // One statement reads both rates from one active batch, even during a sync.
    const rows = await this.db.query<ConversionRates[]>(
      `SELECT b.id AS "batchId", b."providerUpdatedAt" AS "ratesUpdatedAt",
        origin.rate::text AS "fromRate", destination.rate::text AS "toRate",
        b."providerUpdatedAt" < now() - interval '48 hours' AS stale
       FROM exchange_rate_batches b
       LEFT JOIN exchange_rates origin ON origin."batchId" = b.id
         AND origin."currencyCode" = $1
       LEFT JOIN exchange_rates destination ON destination."batchId" = b.id
         AND destination."currencyCode" = $2
       WHERE b."isActive" = true`,
      [from, to],
    );
    return rows[0] ?? null;
  }
}
