import {
  getProfileCurrencyOptions,
  resolveProfileCurrency,
  validateProfileCurrency,
} from './profile-currency';

describe('Profile country and currency catalog', () => {
  it.each([
    [null, null, 'CRC', 'default'],
    ['CR', null, 'CRC', 'country'],
    ['US', null, 'USD', 'country'],
    ['ES', null, 'EUR', 'country'],
    ['JP', null, 'JPY', 'country'],
    ['ES', 'USD', 'USD', 'preference'],
    [null, 'EUR', 'EUR', 'preference'],
  ])(
    'resolves %s/%s to %s',
    (country, preference, resolvedCurrency, currencySource) => {
      expect(resolveProfileCurrency(country, preference)).toEqual({
        resolvedCurrency,
        currencySource,
      });
    },
  );

  it('allows clearing both fields and rejects unknown countries and asset symbols', () => {
    expect(() => validateProfileCurrency(null, null)).not.toThrow();
    expect(() => validateProfileCurrency('ZZ', 'USD')).toThrow();
    for (const code of ['DOGE', 'BTC', 'XAU', 'XXX', 'ZZZ']) {
      expect(() => validateProfileCurrency('CR', code)).toThrow();
    }
  });

  it('provides local named options with an automatic currency for every territory', () => {
    const options = getProfileCurrencyOptions();
    expect(options.countries.length).toBeGreaterThan(200);
    expect(options.countries).toContainEqual({
      code: 'CR',
      name: 'Costa Rica',
      currency: 'CRC',
    });
    expect(options.currencies.some((currency) => currency.code === 'USD')).toBe(
      true,
    );
    expect(options.currencies.some((currency) => currency.code === 'XAU')).toBe(
      false,
    );
    expect(options.currencies.some((currency) => currency.code === 'BTC')).toBe(
      false,
    );
    for (const country of options.countries) {
      expect(
        options.currencies.some(
          (currency) => currency.code === country.currency,
        ),
      ).toBe(true);
    }
  });
});
