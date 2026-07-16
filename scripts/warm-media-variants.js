/**
 * One-off warm-up: pre-generate the image variants the app actually renders
 * (thumb 400x400, feed 1080, preview 720) for all existing content, so users
 * never pay the first-hit generation latency (~1-2s per image).
 *
 * Idempotent and resumable — the proxy HEAD-checks existing derived objects
 * and answers in ~100ms for anything already generated. Run on the droplet:
 *   nohup node scripts/warm-media-variants.js > warm-variants.log 2>&1 &
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

const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));
const axiosLib = require(path.join(ROOT, 'node_modules/axios'));
const axios = axiosLib.default || axiosLib;

const PROXY_BASE = (env.MEDIA_PROXY_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const CONCURRENCY = 4;
const IMAGE_MARKER = '/media/image/upload/';
const IMAGE_VARIANTS = [
  't_yallery_thumb_image_v2',
  't_yallery_feed_image_v2',
  't_yallery_preview_image_v2',
];

/** table, column, variants to warm */
const SOURCES = [
  ['posts', 'imageUrl', IMAGE_VARIANTS],
  ['posts', 'previewImageUrl', ['t_yallery_thumb_image_v2', 't_yallery_preview_image_v2']],
  ['users', 'avatar', ['t_yallery_thumb_image_v2']],
  ['contests', 'imageUrl', ['t_yallery_thumb_image_v2', 't_yallery_preview_image_v2']],
  ['tags', 'imageUrl', ['t_yallery_thumb_image_v2']],
  ['styles', 'imageUrl', ['t_yallery_thumb_image_v2']],
  ['memes', 'referenceImageUrl', ['t_yallery_thumb_image_v2', 't_yallery_preview_image_v2']],
];

function variantUrls(url, variants) {
  if (typeof url !== 'string' || !url.includes(IMAGE_MARKER)) return [];
  // Poster jpgs that live under video/upload keep their own healing path.
  return variants.map((variant) =>
    url.replace(IMAGE_MARKER, `${IMAGE_MARKER}${variant}/`),
  );
}

(async () => {
  if (!PROXY_BASE) {
    console.error('MEDIA_PROXY_PUBLIC_BASE_URL missing in .env');
    process.exit(1);
  }
  const conn = await mysql.createConnection({
    host: env.DATABASE_HOST,
    port: +env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });

  const urls = new Set();
  for (const [table, column, variants] of SOURCES) {
    const [rows] = await conn.query(
      `SELECT DISTINCT \`${column}\` v FROM \`${table}\`
       WHERE \`${column}\` LIKE '%${IMAGE_MARKER}%'`,
    );
    rows.forEach(({ v }) =>
      variantUrls(v, variants).forEach((u) => urls.add(u)),
    );
    console.log(`${table}.${column}: ${rows.length} sources`);
  }
  await conn.end();

  const queue = [...urls];
  const total = queue.length;
  console.log(`Warming ${total} variant URLs...`);
  let ok = 0;
  let failed = 0;

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        // HEAD is enough — generation happens server-side on resolve; we do
        // not need to pull the bytes to this shell.
        const res = await axios.head(url, {
          timeout: 120000,
          maxRedirects: 0,
          validateStatus: (s) => s < 500,
        });
        if (res.status < 400) ok++;
        else failed++;
      } catch (e) {
        failed++;
      }
      const done = ok + failed;
      if (done % 500 === 0) {
        console.log(
          `${new Date().toISOString()} progress: ${done}/${total} (${failed} failed)`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`DONE: ${ok} warmed, ${failed} failed of ${total}`);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
