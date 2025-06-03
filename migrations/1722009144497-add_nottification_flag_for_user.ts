import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNottificationFlagForUser1722009144497 implements MigrationInterface {
    name = 'AddNottificationFlagForUser1722009144497'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`notificationsEnabled\` tinyint NOT NULL DEFAULT 1`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`notificationsEnabled\``);
    }

}
