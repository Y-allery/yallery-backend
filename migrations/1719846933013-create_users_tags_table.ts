import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersTagsTable1719846933013 implements MigrationInterface {
    name = 'CreateUsersTagsTable1719846933013'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`users_tags_tags\` (\`usersId\` int NOT NULL, \`tagsId\` int NOT NULL, INDEX \`IDX_e36e86825bbc09e1fc9d3c83fb\` (\`usersId\`), INDEX \`IDX_9de46fe02d9d7488f92bedf417\` (\`tagsId\`), PRIMARY KEY (\`usersId\`, \`tagsId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` ADD CONSTRAINT \`FK_e36e86825bbc09e1fc9d3c83fb0\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` ADD CONSTRAINT \`FK_9de46fe02d9d7488f92bedf4176\` FOREIGN KEY (\`tagsId\`) REFERENCES \`tags\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` DROP FOREIGN KEY \`FK_9de46fe02d9d7488f92bedf4176\``);
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` DROP FOREIGN KEY \`FK_e36e86825bbc09e1fc9d3c83fb0\``);
        await queryRunner.query(`DROP INDEX \`IDX_9de46fe02d9d7488f92bedf417\` ON \`users_tags_tags\``);
        await queryRunner.query(`DROP INDEX \`IDX_e36e86825bbc09e1fc9d3c83fb\` ON \`users_tags_tags\``);
        await queryRunner.query(`DROP TABLE \`users_tags_tags\``);
    }

}
