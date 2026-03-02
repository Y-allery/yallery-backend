import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTagToMemes1769003400000 implements MigrationInterface {
  name = 'AddTagToMemes1769003400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`memes\`
      ADD COLUMN \`tagId\` int NULL,
      ADD CONSTRAINT \`FK_memes_tag\` FOREIGN KEY (\`tagId\`) REFERENCES \`tags\`(\`id\`) ON DELETE RESTRICT
    `);
    const otherTag = await queryRunner.query(
      `SELECT id FROM \`tags\` WHERE name = 'other' LIMIT 1`,
    );
    const firstTag = await queryRunner.query(`SELECT id FROM \`tags\` ORDER BY id ASC LIMIT 1`);
    const tagId = (otherTag?.[0]?.id ?? firstTag?.[0]?.id) as number | undefined;
    if (tagId != null) {
      await queryRunner.query(`UPDATE \`memes\` SET \`tagId\` = ${tagId} WHERE \`tagId\` IS NULL`);
      await queryRunner.query(`ALTER TABLE \`memes\` MODIFY COLUMN \`tagId\` int NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`memes\` DROP FOREIGN KEY \`FK_memes_tag\``);
    await queryRunner.query(`ALTER TABLE \`memes\` DROP COLUMN \`tagId\``);
  }
}
