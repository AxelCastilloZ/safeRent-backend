export const CURRENCY_TIME_ZONE = 'America/Costa_Rica';
export const CURRENCY_DAILY_CRON = '0 0 0 * * *';
export const CURRENCY_MAX_DAILY_ATTEMPTS = 3;
export const CURRENCY_MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;
export const CURRENCY_RETRY_DELAYS_MS = [60_000, 300_000] as const;

export function isTransientCurrencyError(code: string | null): boolean {
  return (
    code === 'CURRENCY_REQUEST_FAILED' ||
    code === 'CURRENCY_PROVIDER_500' ||
    code === 'CURRENCY_HTTP_408' ||
    code === 'CURRENCY_HTTP_429' ||
    /^CURRENCY_HTTP_5\d\d$/.test(code ?? '')
  );
}

export interface AutomaticSyncState {
  now: Date;
  attempts: number;
  confirmedToday: boolean;
  providerUpdatedAt: Date | null;
  lastStatus: string | null;
  lastErrorCode: string | null;
  lastFinishedAt: Date | null;
}

export type AutomaticSyncDecision =
  | { due: true }
  | {
      due: false;
      reason:
        | 'CURRENCY_UP_TO_DATE'
        | 'CURRENCY_DAILY_ATTEMPTS_EXHAUSTED'
        | 'CURRENCY_REQUIRES_ATTENTION'
        | 'CURRENCY_RETRY_PENDING';
    };

/** All inputs come from PostgreSQL under the shared synchronization lock. */
export function decideAutomaticSync(
  state: AutomaticSyncState,
): AutomaticSyncDecision {
  const recent =
    state.providerUpdatedAt !== null &&
    state.providerUpdatedAt.getTime() >=
      state.now.getTime() - CURRENCY_MAX_RATE_AGE_MS;
  if (state.confirmedToday && recent) {
    return { due: false, reason: 'CURRENCY_UP_TO_DATE' };
  }
  if (state.attempts >= CURRENCY_MAX_DAILY_ATTEMPTS) {
    return { due: false, reason: 'CURRENCY_DAILY_ATTEMPTS_EXHAUSTED' };
  }
  if (
    state.lastStatus === 'failed' &&
    !isTransientCurrencyError(state.lastErrorCode)
  ) {
    return { due: false, reason: 'CURRENCY_REQUIRES_ATTENTION' };
  }
  if (state.attempts > 0 && state.lastFinishedAt !== null) {
    const delay = CURRENCY_RETRY_DELAYS_MS[state.attempts - 1];
    if (state.now.getTime() < state.lastFinishedAt.getTime() + delay) {
      return { due: false, reason: 'CURRENCY_RETRY_PENDING' };
    }
  }
  return { due: true };
}
