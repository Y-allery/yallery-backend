import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPointsToActivity1722334437706 implements MigrationInterface {
    name = 'AddPointsToActivity1722334437706'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`activity\` ADD \`points\` int NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`activity\` DROP COLUMN \`points\``);
    }

}
