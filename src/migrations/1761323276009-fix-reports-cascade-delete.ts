import { MigrationInterface, QueryRunner } from "typeorm";

export class FixReportsCascadeDelete1761323276009 implements MigrationInterface {
    name = 'FixReportsCascadeDelete1761323276009'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`reports\` DROP FOREIGN KEY \`FK_6bebfa3fc68a35f5af3f9883c4e\``);
        await queryRunner.query(`DROP INDEX \`UQ_partner_link\` ON \`partner_user_links\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_044145bbf9a1623aaf0028441e\` ON \`partner_user_links\` (\`partnershipId\`, \`partnerUserId\`)`);
        await queryRunner.query(`ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_e592673989138da18babffdef7e\` FOREIGN KEY (\`contest_id\`) REFERENCES \`contests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_624114671c34d2515ec04c2c88c\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`contests\` ADD CONSTRAINT \`FK_6e6e5f451eb21f7913a840e5528\` FOREIGN KEY (\`postWinnerId\`) REFERENCES \`posts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`likes\` ADD CONSTRAINT \`FK_cfd8e81fac09d7339a32e57d904\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`posts\` ADD CONSTRAINT \`FK_2ba375b245d0e7a5f48688b9042\` FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`notification_preferences\` ADD CONSTRAINT \`FK_b70c44e8b00757584a393225593\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`referrals\` ADD CONSTRAINT \`FK_2f8fb8a07f16dea31f65be9955d\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`referrals\` ADD CONSTRAINT \`FK_60324a86c07ca2a5de3d66d7a48\` FOREIGN KEY (\`usedById\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`reports\` ADD CONSTRAINT \`FK_6bebfa3fc68a35f5af3f9883c4e\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`partner_user_links\` ADD CONSTRAINT \`FK_4c7972105570714ff23c55ba124\` FOREIGN KEY (\`partnershipId\`) REFERENCES \`partnerships\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`partner_user_links\` ADD CONSTRAINT \`FK_d805a093520c0278f9f15006a0a\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`partnership_activities\` ADD CONSTRAINT \`FK_9f531421962b0324560aea0d819\` FOREIGN KEY (\`partnershipId\`) REFERENCES \`partnerships\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` ADD CONSTRAINT \`FK_9de46fe02d9d7488f92bedf4176\` FOREIGN KEY (\`tagsId\`) REFERENCES \`tags\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users_tags_tags\` DROP FOREIGN KEY \`FK_9de46fe02d9d7488f92bedf4176\``);
        await queryRunner.query(`ALTER TABLE \`partnership_activities\` DROP FOREIGN KEY \`FK_9f531421962b0324560aea0d819\``);
        await queryRunner.query(`ALTER TABLE \`partner_user_links\` DROP FOREIGN KEY \`FK_d805a093520c0278f9f15006a0a\``);
        await queryRunner.query(`ALTER TABLE \`partner_user_links\` DROP FOREIGN KEY \`FK_4c7972105570714ff23c55ba124\``);
        await queryRunner.query(`ALTER TABLE \`reports\` DROP FOREIGN KEY \`FK_6bebfa3fc68a35f5af3f9883c4e\``);
        await queryRunner.query(`ALTER TABLE \`referrals\` DROP FOREIGN KEY \`FK_60324a86c07ca2a5de3d66d7a48\``);
        await queryRunner.query(`ALTER TABLE \`referrals\` DROP FOREIGN KEY \`FK_2f8fb8a07f16dea31f65be9955d\``);
        await queryRunner.query(`ALTER TABLE \`notification_preferences\` DROP FOREIGN KEY \`FK_b70c44e8b00757584a393225593\``);
        await queryRunner.query(`ALTER TABLE \`posts\` DROP FOREIGN KEY \`FK_2ba375b245d0e7a5f48688b9042\``);
        await queryRunner.query(`ALTER TABLE \`likes\` DROP FOREIGN KEY \`FK_cfd8e81fac09d7339a32e57d904\``);
        await queryRunner.query(`ALTER TABLE \`contests\` DROP FOREIGN KEY \`FK_6e6e5f451eb21f7913a840e5528\``);
        await queryRunner.query(`ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_624114671c34d2515ec04c2c88c\``);
        await queryRunner.query(`ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_e592673989138da18babffdef7e\``);
        await queryRunner.query(`DROP INDEX \`IDX_044145bbf9a1623aaf0028441e\` ON \`partner_user_links\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_partner_link\` ON \`partner_user_links\` (\`partnershipId\`, \`partnerUserId\`)`);
        await queryRunner.query(`ALTER TABLE \`reports\` ADD CONSTRAINT \`FK_6bebfa3fc68a35f5af3f9883c4e\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
