import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaGenerationCharges1782000000000
  implements MigrationInterface
{
  name = 'CreateMediaGenerationCharges1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`media_generation_charges\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`chargeKey\` varchar(64) NOT NULL,
        \`userId\` int NOT NULL,
        \`amount\` int NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'reserved',
        \`jobId\` varchar(64) NULL,
        \`aiService\` varchar(80) NULL,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_media_generation_charges_charge_key\` (\`chargeKey\`),
        INDEX \`IDX_media_generation_charges_user_status\` (\`userId\`, \`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `media_generation_charges`');
  }
}
