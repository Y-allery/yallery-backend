import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaAISettings1769003500000
  implements MigrationInterface
{
  name = 'CreateMediaAISettings1769003500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`media_ai_settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`aiService\` varchar(120) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` text NULL,
        \`provider\` varchar(120) NOT NULL,
        \`capability\` varchar(120) NOT NULL,
        \`cost\` int NOT NULL DEFAULT 0,
        \`isActive\` tinyint NOT NULL DEFAULT 1,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_media_ai_settings_aiService_capability\`
      ON \`media_ai_settings\` (\`aiService\`, \`capability\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_media_ai_settings_capability_isActive\`
      ON \`media_ai_settings\` (\`capability\`, \`isActive\`)
    `);

    await queryRunner.query(`
      INSERT INTO \`media_ai_settings\` (
        \`aiService\`,
        \`name\`,
        \`description\`,
        \`provider\`,
        \`capability\`,
        \`cost\`,
        \`isActive\`
      ) VALUES
      (
        'flux',
        'FLUX AI',
        'Prompt-to-image generation powered by RunPod FLUX endpoint.',
        'runpod',
        'image_generate',
        30,
        1
      ),
      (
        'sdxl',
        'SDXL',
        'Prompt-to-image generation powered by RunPod SDXL endpoint.',
        'runpod',
        'image_generate',
        11,
        1
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_media_ai_settings_capability_isActive` ON `media_ai_settings`',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_media_ai_settings_aiService_capability` ON `media_ai_settings`',
    );
    await queryRunner.query('DROP TABLE `media_ai_settings`');
  }
}
