import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantsStatsToAdminMetrics1765400002000
  implements MigrationInterface
{
  name = 'AddParticipantsStatsToAdminMetrics1765400002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`admin_metrics\` 
      ADD COLUMN \`participantsStats\` JSON NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`admin_metrics\` 
      DROP COLUMN \`participantsStats\`
    `);
  }
}

