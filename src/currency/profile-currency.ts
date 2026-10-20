import { BadRequestException } from '@nestjs/common';
import { COUNTRY_CURRENCIES } from './country-currencies';
import { currencyFractionDigits } from './currency-metadata';

export const PROFILE_COUNTRY_CODES = Object.keys(COUNTRY_CURRENCIES);
export const PROFILE_CURRENCY_CODES = [
  ...new Set([
    'CRC',
    'USD',
    'EUR',
    ...Object.values(COUNTRY_CURRENCIES).filter(
      (code): code is string => code !== null,
    ),
  ]),
]
  .filter((code) => currencyFractionDigits(code) !== null)
  .sort();
const enabled = new Set(PROFILE_CURRENCY_CODES);

export function resolveProfileCurrency(
  countryCode: string | null | undefined,
  preferredCurrency: string | null | undefined,
) {
  if (preferredCurrency && enabled.has(preferredCurrency)) {
    return {
      resolvedCurrency: preferredCurrency,
      currencySource: 'preference' as const,
    };
  }
  const countryCurrency = countryCode ? COUNTRY_CURRENCIES[countryCode] : null;
  if (countryCurrency && enabled.has(countryCurrency)) {
    return {
      resolvedCurrency: countryCurrency,
      currencySource: 'country' as const,
    };
  }
  return { resolvedCurrency: 'CRC', currencySource: 'default' as const };
}

export function validateProfileCurrency(
  countryCode: unknown,
  preferredCurrency: unknown,
): void {
  if (
    countryCode !== undefined &&
    countryCode !== null &&
    (typeof countryCode !== 'string' ||
      !PROFILE_COUNTRY_CODES.includes(countryCode))
  ) {
    throw new BadRequestException('País o territorio no admitido.');
  }
  if (
    preferredCurrency !== undefined &&
    preferredCurrency !== null &&
    (typeof preferredCurrency !== 'string' || !enabled.has(preferredCurrency))
  ) {
    throw new BadRequestException('Moneda preferida no admitida.');
  }
}

export function getProfileCurrencyOptions() {
  const regions = new Intl.DisplayNames(['es'], { type: 'region' });
  const currencies = new Intl.DisplayNames(['es'], { type: 'currency' });
  return {
    countries: PROFILE_COUNTRY_CODES.map((code) => ({
      code,
      name: regions.of(code) ?? code,
      currency: resolveProfileCurrency(code, null).resolvedCurrency,
    })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    currencies: PROFILE_CURRENCY_CODES.map((code) => ({
      code,
      name: currencies.of(code) ?? code,
    })),
    defaultCurrency: 'CRC',
  };
}
