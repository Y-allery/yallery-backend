import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeNicknameNullable1719839635774 implements MigrationInterface {
    name = 'MakeNicknameNullable1719839635774'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`nickname\` \`nickname\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`nickname\` \`nickname\` varchar(255) NOT NULL DEFAULT ''`);
    }

}
