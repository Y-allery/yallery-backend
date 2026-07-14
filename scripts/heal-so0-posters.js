/**
 * Warms every legacy so_0 video-poster URL through the media proxy so the
 * posters are regenerated & cached in Spaces up front (instead of lazily on
 * first user view). Run on the droplet AFTER rewrite-urls-to-media-proxy.js:
 *   node scripts/heal-so0-posters.js          # GET every distinct so_0 URL, report statuses
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const env = {};
fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  .split('\n')
  .forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
for (const key of Object.keys(process.env)) {
  if (/^[A-Z_0-9]+$/.test(key)) env[key] = process.env[key];
}

const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));
const axiosLib = require(path.join(ROOT, 'node_modules/axios'));
const axios = axiosLib.default || axiosLib;

// Poster generation is serialized on the backend anyway; low concurrency
// keeps the API responsive and avoids piling up long-held connections.
const CONCURRENCY = 2;

const SOURCES = [
  ['posts', 'previewImageUrl'],
  ['user_activities', 'previewUrl'],
];

(async () => {
  const conn = await mysql.createConnection({
    host: env.DATABASE_HOST,
    port: +env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });

  const urls = new Set();
  for (const [table, column] of SOURCES) {
    const [rows] = await conn.query(
      `SELECT DISTINCT \`${column}\` v FROM \`${table}\`
       WHERE \`${column}\` LIKE '%/so_0%' OR \`${column}\` LIKE '%/so_2%'`,
    );
    rows.forEach(({ v }) => v && urls.add(String(v)));
    console.log(`${table}.${column}: ${rows.length} distinct poster URLs`);
  }
  await conn.end();

  async function healAll(list) {
    const queue = [...list];
    let ok = 0;
    const failures = [];

    async function worker() {
      while (queue.length) {
        const url = queue.shift();
        try {
          // GET (not HEAD) and follow the redirect so the CDN object is warmed too.
          const res = await axios.get(url, {
            timeout: 180000,
            maxRedirects: 5,
            responseType: 'arraybuffer',
            validateStatus: () => true,
          });
          if (res.status === 200) {
            ok++;
          } else {
            failures.push({ url, status: res.status });
            // A 5xx usually means the backend is restarting — back off.
            if (res.status >= 500) {
              await new Promise((r) => setTimeout(r, 15000));
            }
          }
        } catch (e) {
          failures.push({ url, status: e.message });
        }
        if ((ok + failures.length) % 20 === 0) {
          console.log(
            `  progress: ${ok} ok, ${failures.length} failed, ${queue.length} left`,
          );
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return { ok, failures };
  }

  console.log(`Healing ${urls.size} posters...`);
  const first = await healAll(urls);
  let failures = first.failures;
  let healed = first.ok;

  if (failures.length) {
    console.log(
      `Retrying ${failures.length} failures after a 30s cool-down...`,
    );
    await new Promise((r) => setTimeout(r, 30000));
    const second = await healAll(failures.map((f) => f.url));
    healed += second.ok;
    failures = second.failures;
  }

  console.log(`DONE: ${healed} healed, ${failures.length} failed`);
  failures.slice(0, 20).forEach((f) => console.log(`  ${f.status} ${f.url}`));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
