import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * contests.description was varchar(255) NOT NULL — silently narrower than the
 * DTO's own @MaxLength(500), so a description between 256-500 chars passed
 * validation and then threw "Data too long for column 'description'" at the
 * DB layer (surfaced to admins as a bare Internal Server Error). Widened to
 * TEXT, matching the existing promptExample column's convention for
 * free-form contest copy.
 */
export class WidenContestDescription1785000000000
  implements MigrationInterface
{
  name = 'WidenContestDescription1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `contests` MODIFY COLUMN `description` TEXT NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `contests` MODIFY COLUMN `description` VARCHAR(255) NOT NULL',
    );
  }
}
