import { ConfigService } from '@nestjs/config';
import {
  CurrencyApiClient,
  CurrencySyncError,
  validateCurrencySnapshot,
} from './currency-api.client';

const valid = () => ({
  valid: true,
  base: 'USD',
  updated: Math.floor(Date.now() / 1000),
  rates: { CRC: 500.123456789, EUR: 0.92, DOGE: 5 },
});

describe('Currency response validation', () => {
  it('accepts documented rates and adds the USD identity rate', () => {
    const result = validateCurrencySnapshot(valid());
    expect(result.rates.USD).toBe('1.000000000000000');
    expect(Number(result.rates.CRC)).toBe(500.123456789);
    expect(result.rates.DOGE).toBe('5');
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it.each([
    null,
    [],
    { ...valid(), valid: false },
    { ...valid(), base: 'EUR' },
    { ...valid(), updated: Date.now() },
    { ...valid(), updated: -1 },
    { ...valid(), updated: 1.5 },
    { ...valid(), rates: {} },
    { ...valid(), rates: { CRC: 500, USD: 2 } },
    { ...valid(), rates: { CRC: 0 } },
    { ...valid(), rates: { CRC: -5 } },
    { ...valid(), rates: { CRC: NaN } },
    { ...valid(), rates: { CRC: Infinity } },
    { ...valid(), rates: { CRC: '500' } },
    { ...valid(), rates: { CRC: 1e15 } },
    { ...valid(), rates: { CRC: 1e-20 } },
    { ...valid(), rates: { CRC: 500, eur: 1 } },
    { ...valid(), rates: { CRC: 500, TOOLONGCODE: 1 } },
  ])('rejects invalid or unrepresentable data %#', (payload) => {
    expect(() => validateCurrencySnapshot(payload)).toThrow(
      'CURRENCY_INVALID_RESPONSE',
    );
  });
});

describe('Currency API client', () => {
  const fetchMock = jest.fn();
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not call the API without a configured key', async () => {
    const client = new CurrencyApiClient(new ConfigService({}));
    await expect(client.fetchSnapshot()).rejects.toThrow(
      'CURRENCY_NOT_CONFIGURED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests USD with a timeout and rejects redirects', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(valid()),
    });
    const client = new CurrencyApiClient(
      new ConfigService({ CURRENCY_API_KEY: 'test-secret' }),
    );
    await expect(client.fetchSnapshot()).resolves.toHaveProperty('rates.USD');
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe('https://currencyapi.net');
    expect(url.searchParams.get('base')).toBe('USD');
    expect(url.searchParams.get('key')).toBe('test-secret');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not expose provider HTTP bodies', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const client = new CurrencyApiClient(
      new ConfigService({ CURRENCY_API_KEY: 'test-secret' }),
    );
    await expect(client.fetchSnapshot()).rejects.toEqual(
      new CurrencySyncError('CURRENCY_HTTP_429'),
    );
  });

  it('sanitizes network and JSON errors that could expose the key', async () => {
    fetchMock.mockRejectedValue(new Error('URL with key=test-secret'));
    const client = new CurrencyApiClient(
      new ConfigService({ CURRENCY_API_KEY: 'test-secret' }),
    );
    await expect(client.fetchSnapshot()).rejects.toEqual(
      new CurrencySyncError('CURRENCY_REQUEST_FAILED'),
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('provider body')),
    });
    await expect(client.fetchSnapshot()).rejects.toThrow(
      'CURRENCY_INVALID_RESPONSE',
    );
  });

  it.each([
    [429, 405],
    [200, 401],
    [500, 500],
  ])(
    'classifies provider code %s/%s without exposing its message',
    async (status, code) => {
      fetchMock.mockResolvedValue({
        ok: status === 200,
        status,
        json: () =>
          Promise.resolve({
            valid: false,
            error: { code, message: 'key=test-secret' },
          }),
      });
      const client = new CurrencyApiClient(
        new ConfigService({ CURRENCY_API_KEY: 'test-secret' }),
      );
      await expect(client.fetchSnapshot()).rejects.toEqual(
        new CurrencySyncError(`CURRENCY_PROVIDER_${code}`),
      );
    },
  );
});
