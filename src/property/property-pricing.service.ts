import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CurrencyRepository,
  type RateSnapshot,
} from '../currency/currency.repository';
import { CurrencyService } from '../currency/currency.service';
import { PROFILE_CURRENCY_CODES } from '../currency/profile-currency';
import type { FindPropertiesDto } from './dto/find-properties.dto';

export interface PropertyPriceContext {
  currency: string;
  snapshot: RateSnapshot | null;
}

@Injectable()
export class PropertyPricingService {
  constructor(
    private readonly rates: CurrencyRepository,
    private readonly conversions: CurrencyService,
  ) {}

  async prepare(query: FindPropertiesDto = {}): Promise<PropertyPriceContext> {
    const currency = query.displayCurrency ?? 'CRC';
    if (!PROFILE_CURRENCY_CODES.includes(currency))
      throw new BadRequestException({ code: "API_MONEDA_DE_VISUALIZACION_INVALIDA", message: 'Moneda de visualización inválida.', params: {  } });
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BadRequestException({ code: "API_EL_MINIMO_NO_PUEDE_SUPERAR_EL_MAXIMO", message: 'El mínimo no puede superar el máximo.', params: {  } });
    let snapshot: RateSnapshot | null;
    try {
      snapshot =
        query.rateBatchId === 0
          ? null
          : await this.rates.getRateSnapshot(query.rateBatchId);
    } catch {
      snapshot = null;
    }
    if (query.rateBatchId !== undefined && query.rateBatchId !== 0 && !snapshot)
      throw new BadRequestException(
        { code: "API_EL_LOTE_DE_TASAS_SOLICITADO_NO_ESTA_DISPONIBLE", message: 'El lote de tasas solicitado no está disponible.', params: {  } },
      );
    return { currency, snapshot };
  }

  async decorate<T extends { cost: number | string; typeOfCoin: string }>(
    properties: T[],
    context: PropertyPriceContext,
  ) {
    return Promise.all(
      properties.map(async (property) => {
        const from = (property.typeOfCoin || 'CRC').toUpperCase();
        if (!PROFILE_CURRENCY_CODES.includes(from))
          return { ...property, displayPrice: null };
        const snapshot = context.snapshot;
        const displayPrice = await this.conversions.convertFromRates(
          { amount: String(property.cost), from, to: context.currency },
          snapshot
            ? {
                batchId: snapshot.batchId,
                ratesUpdatedAt: snapshot.ratesUpdatedAt,
                stale: snapshot.stale,
                fromRate: snapshot.rates[from] ?? null,
                toRate: snapshot.rates[context.currency] ?? null,
              }
            : null,
        );
        return { ...property, displayPrice };
      }),
    );
  }

  summary(context: PropertyPriceContext) {
    return {
      currency: context.currency,
      batchId: context.snapshot?.batchId ?? null,
      ratesUpdatedAt: context.snapshot?.ratesUpdatedAt.toISOString() ?? null,
      stale: context.snapshot?.stale ?? false,
    };
  }
}
