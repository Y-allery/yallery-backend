import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTagIdToContest1721395438017 implements MigrationInterface {
    name = 'AddTagIdToContest1721395438017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`contests\` ADD \`tagId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`contests\` ADD CONSTRAINT \`FK_d139428a7e7a97e2dd0fdda1b43\` FOREIGN KEY (\`tagId\`) REFERENCES \`tags\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`contests\` DROP FOREIGN KEY \`FK_d139428a7e7a97e2dd0fdda1b43\``);
        await queryRunner.query(`ALTER TABLE \`contests\` DROP COLUMN \`tagId\``);
    }

}
