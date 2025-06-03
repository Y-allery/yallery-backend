import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsPublishedToPostEntity1720781148655 implements MigrationInterface {
    name = 'AddIsPublishedToPostEntity1720781148655'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`posts\` ADD \`is_published\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`is_published\``);
    }

}
