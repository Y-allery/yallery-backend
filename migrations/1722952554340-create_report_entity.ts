import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateReportEntity1722952554340 implements MigrationInterface {
    name = 'CreateReportEntity1722952554340'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`reports\` (\`id\` int NOT NULL AUTO_INCREMENT, \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`description\` text NOT NULL, \`reportingUserId\` int NULL, \`reportedUserId\` int NULL, \`postId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`reports\` ADD CONSTRAINT \`FK_14b92bd5f2f538a73bcf781d298\` FOREIGN KEY (\`reportingUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`reports\` ADD CONSTRAINT \`FK_c88d2686339ad6d166620b741a6\` FOREIGN KEY (\`reportedUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`reports\` ADD CONSTRAINT \`FK_6bebfa3fc68a35f5af3f9883c4e\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`reports\` DROP FOREIGN KEY \`FK_6bebfa3fc68a35f5af3f9883c4e\``);
        await queryRunner.query(`ALTER TABLE \`reports\` DROP FOREIGN KEY \`FK_c88d2686339ad6d166620b741a6\``);
        await queryRunner.query(`ALTER TABLE \`reports\` DROP FOREIGN KEY \`FK_14b92bd5f2f538a73bcf781d298\``);
        await queryRunner.query(`DROP TABLE \`reports\``);
    }

}
