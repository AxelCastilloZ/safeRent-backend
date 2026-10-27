import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationException } from './validation-exception';
import { requestLanguage } from './language';
import { seedCatalogCodes } from './catalog-seeds';
import { CreateServiceDto } from '../service/dto/create-service.dto';

describe('Internationalization contracts', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, exceptionFactory: validationException });
  const translate = () => ({ es: { name: 'Agua' }, en: { name: 'Water' }, fr: { name: 'Eau' }, pt: { name: 'Água' } });

  it.each([
    ['fr-CA,es;q=0.8', 'fr'], ['de,en;q=0.9', 'en'], ['en;q=0,pt-BR;q=0.5', 'pt'],
    ['es;q=0.1,fr;q=0.9', 'fr'], ['unsupported', 'es'], [undefined, 'es'],
  ])('negotiates %s as %s', (header, expected) => {
    expect(requestLanguage(header)).toBe(expected);
  });

  it('validates all four catalog languages and strips protected codes', async () => {
    const dto = await pipe.transform({ name: 'Agua', translations: translate(), catalogCode: 'injected' }, { type: 'body', metatype: CreateServiceDto });
    expect(dto.translations.fr.name).toBe('Eau');
    expect(dto).not.toHaveProperty('catalogCode');
  });

  it.each([undefined, { es: { name: 'Agua' } }, { ...translate(), fr: { name: '   ' } }])('rejects incomplete catalog translations', async translations => {
    await expect(pipe.transform({ name: 'Agua', translations }, { type: 'body', metatype: CreateServiceDto })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns validation codes and field paths without the submitted data', async () => {
    try {
      await pipe.transform({ name: 123, translations: translate() }, { type: 'body', metatype: CreateServiceDto });
      throw new Error('Expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse();
      expect(body).toMatchObject({ code: 'VALIDATION_FAILED', details: expect.arrayContaining([{ field: 'name', code: 'isString' }]) });
      expect(JSON.stringify(body)).not.toContain('123');
    }
  });

  it('assigns codes only to known legacy rows without overwriting existing codes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await seedCatalogCodes({ query });
    expect(query).toHaveBeenCalledTimes(12);
    for (const [sql, values] of query.mock.calls) {
      expect(sql).toContain('"catalogCode" IS NULL');
      expect(sql).toContain('NOT EXISTS');
      expect(values).toHaveLength(2);
    }
  });
});
