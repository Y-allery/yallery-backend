import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsBlockedToPost1722859583841 implements MigrationInterface {
    name = 'AddIsBlockedToPost1722859583841'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`posts\` ADD \`is_blocked\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`is_blocked\``);
    }

}
