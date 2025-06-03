import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPointsToUserTable1719506578136 implements MigrationInterface {
  name = 'AddPointsToUserTable1719506578136';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`points\` int NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`points\``);
  }
}
