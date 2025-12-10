import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueEmailIndex1765329001000 implements MigrationInterface {
  name = 'AddUniqueEmailIndex1765329001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD UNIQUE INDEX \`IDX_users_email_unique\` (\`email\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      DROP INDEX \`IDX_users_email_unique\`
    `);
  }
}
