import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentTestAndCreditedPoints1784900000000
  implements MigrationInterface
{
  name = 'AddPaymentTestAndCreditedPoints1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`payments\`
        ADD COLUMN \`isTest\` tinyint(1) NOT NULL DEFAULT 0,
        ADD COLUMN \`pointsCredited\` int NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`payments\`
        DROP COLUMN \`isTest\`,
        DROP COLUMN \`pointsCredited\`
    `);
  }
}
