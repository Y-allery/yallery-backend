import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentEntity1727426090539 implements MigrationInterface {
    name = 'AddPaymentEntity1727426090539'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`payments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`paymentIntentId\` varchar(255) NULL, \`userId\` int NOT NULL, \`productId\` varchar(255) NOT NULL, \`amount\` int NOT NULL, \`currency\` varchar(255) NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'pending', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_a1267c27d37d0c87154be17d93\` (\`paymentIntentId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_a1267c27d37d0c87154be17d93\` ON \`payments\``);
        await queryRunner.query(`DROP TABLE \`payments\``);
    }

}
