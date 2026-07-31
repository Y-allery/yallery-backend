import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch partner links were stored bare (`https://cuyab.app.link/xxxx`), and the admin
 * panel copies `referralLink` verbatim. The signup path links a user only when BOTH
 * `ref` and `puid` reach it, and it reads `ref` off the query string — the token baked
 * into the link's `referral_token` data field feeds a different flow and is not read
 * there. So a bare link produced a `puid` with no `ref`, and the partner attribution was
 * dropped silently, with no error on either side.
 *
 * Web-app links already carried `?ref=`; this brings the Branch ones in line so the
 * partner only has to append `&puid=<their id>`.
 *
 * Links that already carry a `ref` are left alone, which also makes the re-run a no-op.
 */
export class AppendRefToBranchReferralLinks1785900000000
  implements MigrationInterface
{
  name = 'AppendRefToBranchReferralLinks1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`partnerships\`
          SET \`referralLink\` = CONCAT(
                \`referralLink\`,
                IF(LOCATE('?', \`referralLink\`) > 0, '&', '?'),
                'ref=',
                \`referralToken\`
              )
        WHERE \`referralLink\` LIKE '%app.link/%'
          AND \`referralLink\` NOT LIKE '%ref=%'
          AND \`referralToken\` IS NOT NULL
          AND \`referralToken\` <> ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only strips the exact suffix this migration appends, so a link that carried a
    // ref before it ran is not touched.
    await queryRunner.query(
      `UPDATE \`partnerships\`
          SET \`referralLink\` = LEFT(
                \`referralLink\`,
                CHAR_LENGTH(\`referralLink\`)
                  - CHAR_LENGTH(CONCAT('?ref=', \`referralToken\`))
              )
        WHERE \`referralLink\` LIKE '%app.link/%'
          AND \`referralLink\` LIKE CONCAT('%?ref=', \`referralToken\`)`,
    );
  }
}
