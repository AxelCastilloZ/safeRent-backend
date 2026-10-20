import {
  decideAutomaticSync,
  CURRENCY_MAX_RATE_AGE_MS,
  isTransientCurrencyError,
  type AutomaticSyncState,
} from './currency-sync.policy';

const now = new Date('2026-10-20T12:00:00Z');
const state = (
  patch: Partial<AutomaticSyncState> = {},
): AutomaticSyncState => ({
  now,
  attempts: 0,
  confirmedToday: false,
  providerUpdatedAt: null,
  lastStatus: null,
  lastErrorCode: null,
  lastFinishedAt: null,
  ...patch,
});

describe('Durable currency retry policy', () => {
  it('recovers an empty database or an execution missed since midnight', () => {
    expect(decideAutomaticSync(state())).toEqual({ due: true });
    expect(decideAutomaticSync(state({ providerUpdatedAt: now }))).toEqual({
      due: true,
    });
  });

  it('does not repeat a fresh successful check today, even after restart', () => {
    expect(
      decideAutomaticSync(
        state({ attempts: 1, confirmedToday: true, providerUpdatedAt: now }),
      ),
    ).toEqual({ due: false, reason: 'CURRENCY_UP_TO_DATE' });
  });

  it('does not treat a stale provider snapshot as a fresh daily update', () => {
    expect(
      decideAutomaticSync(
        state({
          attempts: 1,
          confirmedToday: true,
          providerUpdatedAt: new Date(
            now.getTime() - CURRENCY_MAX_RATE_AGE_MS - 1,
          ),
        }),
      ),
    ).toEqual({ due: true });
  });

  it('keeps one daily check when provider timestamps lag behind the download', () => {
    expect(
      decideAutomaticSync(
        state({
          attempts: 1,
          confirmedToday: true,
          providerUpdatedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        }),
      ),
    ).toEqual({ due: false, reason: 'CURRENCY_UP_TO_DATE' });
  });

  it.each([1, 2])('waits before retrying after attempt %s', (attempts) => {
    expect(
      decideAutomaticSync(
        state({
          attempts,
          lastStatus: 'failed',
          lastErrorCode: 'CURRENCY_HTTP_503',
          lastFinishedAt: now,
        }),
      ),
    ).toEqual({ due: false, reason: 'CURRENCY_RETRY_PENDING' });
    expect(
      decideAutomaticSync(
        state({
          attempts,
          lastStatus: 'failed',
          lastErrorCode: 'CURRENCY_HTTP_503',
          lastFinishedAt: new Date(now.getTime() - 300_000),
        }),
      ),
    ).toEqual({ due: true });
  });

  it('caps attempts independently of process memory', () => {
    expect(decideAutomaticSync(state({ attempts: 3 }))).toEqual({
      due: false,
      reason: 'CURRENCY_DAILY_ATTEMPTS_EXHAUSTED',
    });
  });

  it.each([
    'CURRENCY_PROVIDER_405',
    'CURRENCY_PROVIDER_401',
    'CURRENCY_HTTP_403',
    'CURRENCY_NOT_CONFIGURED',
    'CURRENCY_INVALID_RESPONSE',
    'CURRENCY_STORAGE_FAILED',
  ])('stops automatic retries for %s', (code) => {
    expect(isTransientCurrencyError(code)).toBe(false);
    expect(
      decideAutomaticSync(
        state({ attempts: 1, lastStatus: 'failed', lastErrorCode: code }),
      ),
    ).toEqual({ due: false, reason: 'CURRENCY_REQUIRES_ATTENTION' });
  });

  it.each([
    'CURRENCY_REQUEST_FAILED',
    'CURRENCY_HTTP_408',
    'CURRENCY_HTTP_429',
    'CURRENCY_HTTP_503',
    'CURRENCY_PROVIDER_500',
  ])('allows bounded retry for %s', (code) => {
    expect(isTransientCurrencyError(code)).toBe(true);
  });
});
