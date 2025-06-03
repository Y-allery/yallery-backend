import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyContestEnum1722864084720 implements MigrationInterface {
  name = 'ModifyContestEnum1722864084720';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` CHANGE \`status\` \`status\` enum ('closed', 'open', 'pending_review') NOT NULL DEFAULT 'closed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` CHANGE \`status\` \`status\` enum ('closed', 'open') NOT NULL DEFAULT 'closed'`,
    );
  }
}
