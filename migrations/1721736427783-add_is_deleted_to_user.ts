import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDeletedToUser1721736427783 implements MigrationInterface {
    name = 'AddIsDeletedToUser1721736427783'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`is_deleted\` tinyint NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`is_deleted\``);
    }

}
