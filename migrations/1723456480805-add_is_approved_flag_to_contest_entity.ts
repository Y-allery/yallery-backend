import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsApprovedFlagToContestEntity1723456480805
  implements MigrationInterface
{
  name = 'AddIsApprovedFlagToContestEntity1723456480805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE \`contests\` ADD \`is_approved\` tinyint NOT NULL DEFAULT 0`,
      );
    } catch (e) {
      console.log(e);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`is_approved\``,
    );
  }
}
