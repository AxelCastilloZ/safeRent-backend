import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordRecovery1791244800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "sessionVersion" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "passwordChangedAt" timestamptz NULL`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY, "userId" integer NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "tokenHash" char(64) NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL,
      "usedAt" timestamptz NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS password_reset_user_expiry ON password_reset_tokens ("userId", "expiresAt")`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS password_recovery_jobs (
      id SERIAL PRIMARY KEY, payload text NOT NULL, attempts integer NOT NULL DEFAULT 0,
      "availableAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS password_recovery_jobs_available ON password_recovery_jobs ("availableAt")`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS password_recovery_limits (
      "key" char(64) PRIMARY KEY, "count" integer NOT NULL DEFAULT 1, "expiresAt" timestamptz NOT NULL)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS password_recovery_limits_expiry ON password_recovery_limits ("expiresAt")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS password_recovery_limits');
    await queryRunner.query('DROP TABLE IF EXISTS password_recovery_jobs');
    await queryRunner.query('DROP TABLE IF EXISTS password_reset_tokens');
    await queryRunner.query(
      'ALTER TABLE "user" DROP COLUMN IF EXISTS "passwordChangedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "user" DROP COLUMN IF EXISTS "sessionVersion"',
    );
  }
}
