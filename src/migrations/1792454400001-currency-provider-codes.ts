import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Provider symbols include non-ISO assets such as DOGE, LINK, USDC and USDT. */
export class CurrencyProviderCodes1792454400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(`SELECT character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'exchange_rates'
        AND column_name = 'currencyCode'`)) as {
      character_maximum_length: number;
    }[];
    if (columns[0]?.character_maximum_length === 10) return;
    await queryRunner.query(`ALTER TABLE exchange_rates
      DROP CONSTRAINT IF EXISTS "exchange_rates_currencyCode_check",
      DROP CONSTRAINT IF EXISTS exchange_rates_currency_code_format,
      ALTER COLUMN "currencyCode" TYPE varchar(10)`);
    await queryRunner.query(`ALTER TABLE exchange_rates
      ADD CONSTRAINT exchange_rates_currency_code_format
      CHECK ("currencyCode" ~ '^[A-Z][A-Z0-9]{2,9}$')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT EXISTS (
      SELECT 1 FROM exchange_rates WHERE length("currencyCode") > 3
    ) AS extended`)) as { extended: boolean }[];
    if (rows[0].extended) {
      throw new Error(
        'Cannot shorten currency codes while extended symbols exist.',
      );
    }
    await queryRunner.query(`ALTER TABLE exchange_rates
      DROP CONSTRAINT IF EXISTS exchange_rates_currency_code_format,
      ALTER COLUMN "currencyCode" TYPE varchar(3)`);
    await queryRunner.query(`ALTER TABLE exchange_rates
      ADD CONSTRAINT exchange_rates_currency_code_format
      CHECK ("currencyCode" ~ '^[A-Z]{3}$')`);
  }
}
