import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  CurrencyRepository,
  type ConversionRates,
} from './currency.repository';
import {
  currencyFractionDigits,
  MONEY_AMOUNT_PATTERN,
} from './currency-metadata';
import type { ConvertCurrencyDto } from './dto/convert-currency.dto';

const Money = Decimal.clone({
  precision: 100,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface ConversionResult {
  status: 'converted' | 'unchanged' | 'unavailable';
  original: { amount: string; currency: string };
  targetCurrency: string;
  converted: { amount: string; currency: string } | null;
  rate: string | null;
  batchId: number | null;
  ratesUpdatedAt: string | null;
  stale: boolean;
  approximate: boolean;
  reason: string | null;
}

@Injectable()
export class CurrencyService {
  constructor(private readonly repository: CurrencyRepository) {}

  async convert(input: ConvertCurrencyDto): Promise<ConversionResult> {
    return this.withRates(input, () =>
      this.repository.findConversionRates(
        input.from.trim().toUpperCase(),
        input.to.trim().toUpperCase(),
      ),
    );
  }

  async convertFromRates(
    input: ConvertCurrencyDto,
    snapshot: ConversionRates | null,
  ): Promise<ConversionResult> {
    return this.withRates(input, () => Promise.resolve(snapshot));
  }

  private async withRates(
    input: ConvertCurrencyDto,
    lookup: () => Promise<ConversionRates | null>,
  ): Promise<ConversionResult> {
    const { amount } = input;
    if (typeof amount !== 'string' || !MONEY_AMOUNT_PATTERN.test(amount)) {
      throw new BadRequestException({
        code: 'CURRENCY_INVALID_AMOUNT',
        message: 'Monto decimal inválido.',
      });
    }
    const from =
      typeof input.from === 'string' ? input.from.trim().toUpperCase() : '';
    const to =
      typeof input.to === 'string' ? input.to.trim().toUpperCase() : '';
    const fromDigits = currencyFractionDigits(from);
    const toDigits = currencyFractionDigits(to);
    if (fromDigits === null || toDigits === null) {
      throw new BadRequestException({
        code: 'CURRENCY_UNSUPPORTED_CODE',
        message: 'Moneda no admitida para conversiones de alquileres.',
      });
    }

    const result: ConversionResult = {
      status: 'unavailable',
      original: { amount, currency: from },
      targetCurrency: to,
      converted: null,
      rate: null,
      batchId: null,
      ratesUpdatedAt: null,
      stale: false,
      approximate: false,
      reason: null,
    };
    if (from === to) {
      return {
        ...result,
        status: 'unchanged',
        converted: { amount, currency: to },
        rate: '1',
      };
    }

    let snapshot: ConversionRates | null;
    try {
      snapshot = await lookup();
    } catch {
      // Informational prices can still display their original amount during an outage.
      return { ...result, reason: 'CURRENCY_STORAGE_UNAVAILABLE' };
    }
    if (!snapshot) return { ...result, reason: 'CURRENCY_RATES_UNAVAILABLE' };
    result.batchId = snapshot.batchId;
    result.ratesUpdatedAt = snapshot.ratesUpdatedAt.toISOString();
    result.stale = snapshot.stale;
    if (snapshot.fromRate === null || snapshot.toRate === null) {
      return { ...result, reason: 'CURRENCY_RATE_MISSING' };
    }

    const origin = new Money(snapshot.fromRate);
    const destination = new Money(snapshot.toRate);
    // Defense against a corrupt snapshot; never divide by zero or invent a rate.
    if (
      !origin.isFinite() ||
      !destination.isFinite() ||
      origin.lte(0) ||
      destination.lte(0)
    ) {
      return { ...result, reason: 'CURRENCY_INVALID_STORED_RATE' };
    }
    const converted = new Money(amount).times(destination).div(origin);
    return {
      ...result,
      status: 'converted',
      converted: { amount: converted.toFixed(toDigits), currency: to },
      // This ratio is explanatory only; amount calculation uses the original rates.
      rate: destination.div(origin).toSignificantDigits(30).toFixed(),
      approximate: true,
    };
  }
}
