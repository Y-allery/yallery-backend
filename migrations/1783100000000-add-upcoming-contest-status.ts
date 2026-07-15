import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUpcomingContestStatus1783100000000
  implements MigrationInterface
{
  name = 'AddUpcomingContestStatus1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`contests\`
      MODIFY \`status\` enum('closed','open','pending_review','upcoming')
      NOT NULL DEFAULT 'closed'
    `);
    // Scheduled-but-not-started contests currently sit in 'closed' — the same
    // status finished contests use. Move them to the new explicit state.
    await queryRunner.query(`
      UPDATE \`contests\`
      SET \`status\` = 'upcoming'
      WHERE \`status\` = 'closed'
        AND \`isApproved\` = 0
        AND \`startTime\` > NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `contests` SET `status` = 'closed' WHERE `status` = 'upcoming'",
    );
    await queryRunner.query(`
      ALTER TABLE \`contests\`
      MODIFY \`status\` enum('closed','open','pending_review')
      NOT NULL DEFAULT 'closed'
    `);
  }
}
