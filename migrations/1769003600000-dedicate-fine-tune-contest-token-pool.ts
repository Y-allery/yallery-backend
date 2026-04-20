import { MigrationInterface, QueryRunner } from 'typeorm';

export class DedicateFineTuneContestTokenPool1769003600000
  implements MigrationInterface
{
  name = 'DedicateFineTuneContestTokenPool1769003600000';

  private readonly dedicatedToken =
    '1e9cd23b-2f33-446c-af81-a97a7e9a67ab:958a47c0567197bc9e6167c4d0c9ab41';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE \`ai_service_tokens\`
        SET \`pool_key\` = 'fal_fine_tune_contests'
        WHERE TRIM(\`token\`) = ?
      `,
      [this.dedicatedToken],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE \`ai_service_tokens\`
        SET \`pool_key\` = 'fal_shared'
        WHERE TRIM(\`token\`) = ?
      `,
      [this.dedicatedToken],
    );
  }
}
