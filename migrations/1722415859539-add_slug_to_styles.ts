import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlugToStyles1722415859539 implements MigrationInterface {
    name = 'AddSlugToStyles1722415859539'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`styles\` ADD \`slug\` varchar(100) NOT NULL DEFAULT 'anime'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`styles\` DROP COLUMN \`slug\``);
    }

}
