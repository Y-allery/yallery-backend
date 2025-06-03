import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeContestStatusToEnum1722855856606 implements MigrationInterface {
    name = 'ChangeContestStatusToEnum1722855856606'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`contests\` DROP COLUMN \`status\``);
        await queryRunner.query(`ALTER TABLE \`contests\` ADD \`status\` enum ('closed', 'open') NOT NULL DEFAULT 'closed'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`contests\` DROP COLUMN \`status\``);
        await queryRunner.query(`ALTER TABLE \`contests\` ADD \`status\` varchar(255) NOT NULL DEFAULT 'open'`);
    }

}
