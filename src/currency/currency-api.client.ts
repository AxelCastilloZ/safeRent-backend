import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class CurrencySyncError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export interface CurrencySnapshot {
  updatedAt: Date;
  rates: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep provider responses and exceptions out of logs and HTTP errors. */
export function validateCurrencySnapshot(
  payload: unknown,
  now = Date.now(),
): CurrencySnapshot {
  const invalid = () => new CurrencySyncError('CURRENCY_INVALID_RESPONSE');
  if (
    !isRecord(payload) ||
    payload.valid !== true ||
    payload.base !== 'USD' ||
    typeof payload.updated !== 'number' ||
    !Number.isSafeInteger(payload.updated) ||
    payload.updated <= 0 ||
    payload.updated * 1000 > now + 300_000 ||
    !isRecord(payload.rates)
  ) {
    throw invalid();
  }

  const rates: Record<string, string> = {};
  for (const [code, value] of Object.entries(payload.rates)) {
    if (
      !/^[A-Z][A-Z0-9]{2,9}$/.test(code) ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value >= 1e15
    ) {
      throw invalid();
    }
    const decimal = value.toFixed(15);
    if (Number(decimal) <= 0) throw invalid();
    // Avoid adding binary floating-point tails with toFixed when serializing.
    rates[code] = value.toString();
  }

  // USD may be omitted by the provider because it is the requested base.
  if ('USD' in rates && payload.rates.USD !== 1) throw invalid();
  if (!('CRC' in rates)) throw invalid();
  rates.USD = '1.000000000000000';
  return { updatedAt: new Date(payload.updated * 1000), rates };
}

@Injectable()
export class CurrencyApiClient {
  constructor(private readonly config: ConfigService) {}

  async fetchSnapshot(): Promise<CurrencySnapshot> {
    const key = this.config.get<string>('CURRENCY_API_KEY')?.trim();
    if (!key) throw new CurrencySyncError('CURRENCY_NOT_CONFIGURED');

    const url = new URL('https://currencyapi.net/api/v2/rates');
    url.searchParams.set('base', 'USD');
    url.searchParams.set('output', 'json');
    url.searchParams.set('key', key);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new CurrencySyncError(
          response.ok
            ? 'CURRENCY_INVALID_RESPONSE'
            : `CURRENCY_HTTP_${response.status}`,
        );
      }
      // Monthly quota (405) can be delivered with HTTP 429; classify the
      // provider's numeric code first so exhausted quota is never retried.
      if (
        isRecord(payload) &&
        payload.valid === false &&
        isRecord(payload.error) &&
        typeof payload.error.code === 'number' &&
        Number.isInteger(payload.error.code) &&
        payload.error.code >= 400 &&
        payload.error.code <= 599
      ) {
        throw new CurrencySyncError(`CURRENCY_PROVIDER_${payload.error.code}`);
      }
      if (!response.ok) {
        throw new CurrencySyncError(`CURRENCY_HTTP_${response.status}`);
      }
      return validateCurrencySnapshot(payload);
    } catch (error: unknown) {
      if (error instanceof CurrencySyncError) throw error;
      // Never propagate fetch errors: their message/cause can contain the URL/key.
      throw new CurrencySyncError('CURRENCY_REQUEST_FAILED');
    }
  }
}
