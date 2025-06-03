import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsDeliveredToPosts1731671616086 implements MigrationInterface {
  name = 'AddIsDeliveredToPosts1731671616086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`is_delivered\` tinyint NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` DROP COLUMN \`is_delivered\``,
    );
  }
}
