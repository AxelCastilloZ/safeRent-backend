import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommentRatings1793059200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE property_comment ADD COLUMN IF NOT EXISTS rating smallint NULL');
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_property_comment_rating' AND conrelid = 'property_comment'::regclass) THEN
        ALTER TABLE property_comment ADD CONSTRAINT ck_property_comment_rating CHECK (rating BETWEEN 1 AND 5);
      END IF;
    END; $$;`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE property_comment DROP CONSTRAINT IF EXISTS ck_property_comment_rating');
    await queryRunner.query('ALTER TABLE property_comment DROP COLUMN IF EXISTS rating');
  }
}
