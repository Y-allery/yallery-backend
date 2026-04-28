import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMemeDurationAndPricing1769005000000
  implements MigrationInterface
{
  name = 'AddMemeDurationAndPricing1769005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`memes\`
      ADD \`referenceVideoDurationSeconds\` double NULL
    `);

    await queryRunner.query(`
      UPDATE \`memes\`
      SET \`referenceVideoDurationSeconds\` = 9.833333
      WHERE \`referenceVideoUrl\` = 'https://res.cloudinary.com/dqsrgkdui/video/upload/v1773777540/meme_reference_videos/lft8ixju3jgblxpaeafh.mp4'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.pricing',
        JSON_OBJECT(
          'strategy',
          'per_second',
          'creditsPerSecond',
          10
        )
      )
      WHERE \`aiService\` = 'wan22_animate_native'
        AND \`capability\` = 'meme_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_REMOVE(COALESCE(\`settings\`, JSON_OBJECT()), '$.pricing')
      WHERE \`aiService\` = 'wan22_animate_native'
        AND \`capability\` = 'meme_generate'
    `);

    await queryRunner.query(`
      ALTER TABLE \`memes\`
      DROP COLUMN \`referenceVideoDurationSeconds\`
    `);
  }
}
