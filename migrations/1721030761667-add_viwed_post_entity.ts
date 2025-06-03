import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViwedPostEntity1721030761667 implements MigrationInterface {
    name = 'AddViwedPostEntity1721030761667'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`viewed_posts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NULL, \`postId\` int NULL, UNIQUE INDEX \`IDX_b5b9770dbeef762363777500c3\` (\`userId\`, \`postId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_a0e468af438154afdd372fd2bcb\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_520606ef9e0414e7a540b689d8c\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`FK_520606ef9e0414e7a540b689d8c\``);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`FK_a0e468af438154afdd372fd2bcb\``);
        await queryRunner.query(`DROP INDEX \`IDX_b5b9770dbeef762363777500c3\` ON \`viewed_posts\``);
        await queryRunner.query(`DROP TABLE \`viewed_posts\``);
    }

}
