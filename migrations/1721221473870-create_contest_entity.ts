import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateContestEntity1721221473870 implements MigrationInterface {
    name = 'CreateContestEntity1721221473870'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`contests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`imageUrl\` varchar(255) NOT NULL, \`description\` varchar(255) NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'open', \`reward\` int NULL, \`start_time\` timestamp NOT NULL, \`end_time\` timestamp NOT NULL, \`winnerId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`contests_participants_users\` (\`contestsId\` int NOT NULL, \`usersId\` int NOT NULL, INDEX \`IDX_a2d3fd26863eada4a93d7bacbe\` (\`contestsId\`), INDEX \`IDX_0ae6fdff1051c718f427d03367\` (\`usersId\`), PRIMARY KEY (\`contestsId\`, \`usersId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`posts\` ADD \`contestId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`contests\` ADD CONSTRAINT \`FK_626cdf2b3e9c9e74e076e19c0a9\` FOREIGN KEY (\`winnerId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`posts\` ADD CONSTRAINT \`FK_2ba375b245d0e7a5f48688b9042\` FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`contests_participants_users\` ADD CONSTRAINT \`FK_a2d3fd26863eada4a93d7bacbe9\` FOREIGN KEY (\`contestsId\`) REFERENCES \`contests\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`contests_participants_users\` ADD CONSTRAINT \`FK_0ae6fdff1051c718f427d03367c\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`contests_participants_users\` DROP FOREIGN KEY \`FK_0ae6fdff1051c718f427d03367c\``);
        await queryRunner.query(`ALTER TABLE \`contests_participants_users\` DROP FOREIGN KEY \`FK_a2d3fd26863eada4a93d7bacbe9\``);
        await queryRunner.query(`ALTER TABLE \`posts\` DROP FOREIGN KEY \`FK_2ba375b245d0e7a5f48688b9042\``);
        await queryRunner.query(`ALTER TABLE \`contests\` DROP FOREIGN KEY \`FK_626cdf2b3e9c9e74e076e19c0a9\``);
        await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`contestId\``);
        await queryRunner.query(`DROP INDEX \`IDX_0ae6fdff1051c718f427d03367\` ON \`contests_participants_users\``);
        await queryRunner.query(`DROP INDEX \`IDX_a2d3fd26863eada4a93d7bacbe\` ON \`contests_participants_users\``);
        await queryRunner.query(`DROP TABLE \`contests_participants_users\``);
        await queryRunner.query(`DROP TABLE \`contests\``);
    }

}
