import { MigrationInterface, QueryRunner } from "typeorm";

export class DeleteFieldsFromUser1719847753848 implements MigrationInterface {
    name = 'DeleteFieldsFromUser1719847753848'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`location\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`phone_number\``);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`phone_number\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`location\` json NULL`);
    }

}
