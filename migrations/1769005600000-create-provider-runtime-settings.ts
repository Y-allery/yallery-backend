import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviderRuntimeSettings1769005600000
  implements MigrationInterface
{
  name = 'CreateProviderRuntimeSettings1769005600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`provider_runtime_settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`key\` varchar(120) NOT NULL,
        \`provider\` varchar(60) NOT NULL,
        \`group\` varchar(80) NOT NULL,
        \`label\` varchar(160) NOT NULL,
        \`type\` varchar(40) NOT NULL,
        \`validationKind\` varchar(60) NOT NULL,
        \`isSecret\` tinyint NOT NULL DEFAULT 0,
        \`valueEncrypted\` text NULL,
        \`valuePlain\` text NULL,
        \`source\` varchar(30) NOT NULL DEFAULT 'db',
        \`updatedById\` int NULL,
        UNIQUE INDEX \`IDX_provider_runtime_settings_key\` (\`key\`),
        INDEX \`IDX_provider_runtime_settings_provider_group\` (\`provider\`, \`group\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `provider_runtime_settings`');
  }
}
