import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { PropertyPricingService } from './property-pricing.service';
import { LocationService } from './location.service';
import { CurrencyRepository } from '../currency/currency.repository';
import { CurrencyService } from '../currency/currency.service';
type TestBody = {
  data: { displayPrice: unknown }[];
  priceContext: { batchId: number };
  displayPrice: { converted: unknown };
};

describe('Property price HTTP integration', () => {
  let app: INestApplication;
  const rates = { getRateSnapshot: jest.fn() };
  const properties = {
    findAll: jest.fn(),
    findActive: jest.fn(),
    findPublic: jest.fn(),
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    rates.getRateSnapshot.mockResolvedValue({
      batchId: 4,
      ratesUpdatedAt: new Date('2026-10-20T06:00:00Z'),
      rates: { USD: '1', CRC: '500', EUR: '0.8' },
      stale: false,
    });
    const item = { id: 1, cost: '500.00', typeOfCoin: 'USD' };
    properties.findAll.mockResolvedValue({
      data: [item],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    properties.findActive.mockImplementation(properties.findAll);
    properties.findPublic.mockResolvedValue(item);
    const module = await Test.createTestingModule({
      controllers: [PropertyController],
      providers: [
        { provide: PropertyService, useValue: properties },
        { provide: LocationService, useValue: {} },
        { provide: CurrencyRepository, useValue: rates },
        CurrencyService,
        PropertyPricingService,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('quotes the listing using one local batch and preserves original fields', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get(
        '/properties?displayCurrency=crc&minPrice=200000&sourceCurrency=USD&sort=price_asc',
      )
      .expect(200);
    expect((response.body as TestBody).data[0]).toMatchObject({
      cost: '500.00',
      typeOfCoin: 'USD',
      displayPrice: {
        converted: { amount: '250000.00', currency: 'CRC' },
        batchId: 4,
      },
    });
    expect((response.body as TestBody).priceContext.batchId).toBe(4);
    expect(rates.getRateSnapshot).toHaveBeenCalledTimes(1);
    const calls = properties.findAll.mock.calls as unknown[][];
    expect(calls[0][0]).toMatchObject({
      displayCurrency: 'CRC',
      minPrice: 200000,
      sourceCurrency: 'USD',
      sort: 'price_asc',
    });
  });
  it('defaults guest listings to CRC and applies the same quote to public detail', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/properties/active/1')
      .expect(200);
    expect((response.body as TestBody).displayPrice.converted).toEqual({
      amount: '250000.00',
      currency: 'CRC',
    });
  });
  it('returns original prices when the rate table is unavailable', async () => {
    rates.getRateSnapshot.mockRejectedValue(
      new Error('private database error'),
    );
    const response = await request(app.getHttpServer() as Server)
      .get('/properties')
      .expect(200);
    expect((response.body as TestBody).data[0].displayPrice).toMatchObject({
      status: 'unavailable',
      converted: null,
      original: { amount: '500.00', currency: 'USD' },
    });
  });
  it.each([
    'displayCurrency=BTC',
    'sourceCurrency=DOGE',
    'sort=unknown',
    'minPrice=Infinity',
    'minPrice=NaN',
    'minPrice=200&maxPrice=100',
    'rateBatchId=-1',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer() as Server)
      .get('/properties?' + query)
      .expect(400);
    expect(properties.findAll).not.toHaveBeenCalled();
  });
  it('rejects missing pinned batches instead of silently using a different lot', async () => {
    rates.getRateSnapshot.mockResolvedValue(null);
    await request(app.getHttpServer() as Server)
      .get('/properties?rateBatchId=4')
      .expect(400);
    expect(properties.findAll).not.toHaveBeenCalled();
  });
  it('pins the no-rates state across later pages with batch zero', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/properties?rateBatchId=0')
      .expect(200);
    expect((response.body as TestBody).data[0].displayPrice).toMatchObject({
      status: 'unavailable',
      converted: null,
    });
    expect(rates.getRateSnapshot).not.toHaveBeenCalled();
  });
});
