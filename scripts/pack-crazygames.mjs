#!/usr/bin/env node
/**
 * Packs the CrazyGames upload from `dist-crazygames/` and checks it against their hard limits.
 * Run `pnpm crazy:build` first, or just `pnpm crazy:pack`, which does both.
 *
 * They want a zip with index.html at the root, no absolute paths, at most 1500 files and 250MB
 * total. The initial download, which is everything fetched before the first gameplay-start event,
 * has to stay under 50MB, and under 20MB to be eligible for the mobile home page. This game
 * preloads most assets before the title screen, so its initial download is most of the bundle.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist-crazygames';
const OUT = join('release', 'superbreaker-crazygames.zip');

/** Dropped wherever they turn up. */
const DROP_NAMES = new Set(['.DS_Store']);

/** Files other targets need that are dead weight inside their iframe. */
const DROP_PATHS = new Set([
  // Read by Cloudflare on deploy, never served.
  '_headers',
  '.assetsignore',
  // Install icons for the PWA and the app stores. CrazyGames shows its own cover art.
  'icons/icon-512.png',
  'icons/icon-1024.png',
  'icons/icon-maskable-512.png',
]);

/**
 * Backdrop art is the one thing not preloaded up front: `ParallaxBackdrop.preload` pulls a single
 * world at a single resolution from the Play scene, so only the heaviest world counts toward the
 * initial download. Wide screens get the 16:9 set, phones the smaller one.
 */
const DEFERRED = /^assets\/images\/backdrops(-hd)?\//;

/**
 * Loaded by the Play scene as a fight or a bonus stage starts, which is never before the first
 * level: the bosses' sheets and rigs, and their tracks and the gallery's. The Crucible's folder
 * stays in the count, since Chapter I plays before level 1 and borrows its pieces.
 */
const LATER = /^assets\/(images\/bosses\/(?!crucible\/)|audio\/music\/(boss|gallery)-)/;

/**
 * Served compressed, so these cost far less than their size on disk. Audio, images and fonts are
 * already compressed and transfer at roughly their file size.
 */
const COMPRESSIBLE = /\.(js|css|html|json|tmj|tsj|webmanifest|svg|fnt|xml|txt)$/;

const MAX_FILES = 1500;
const MAX_TOTAL = 250 * 1024 * 1024;
const MAX_INITIAL = 50 * 1024 * 1024;
const MOBILE_HOME_INITIAL = 20 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function prune(dir) {
  for (const path of walk(dir)) {
    const rel = relative(dir, path);
    if (DROP_PATHS.has(rel) || DROP_NAMES.has(rel.split('/').pop())) {
      rmSync(path);
      console.log(`dropped ${rel}`);
    }
  }
}

/**
 * Splits the bundle into what every player downloads before the first level and what waits until
 * a world is entered. The deferred half is grouped per world, and the heaviest group is added
 * back, since one world always loads before gameplay starts.
 */
function initialSize(entries, field) {
  let base = 0;
  const worlds = new Map();
  for (const entry of entries) {
    const size = entry[field];
    if (LATER.test(entry.rel)) continue;
    if (!DEFERRED.test(entry.rel)) {
      base += size;
      continue;
    }
    // e.g. assets/images/backdrops-hd/crypt
    const world = entry.rel.split('/').slice(0, 4).join('/');
    worlds.set(world, (worlds.get(world) ?? 0) + size);
  }
  const heaviest = (hd) =>
    Math.max(0, ...[...worlds].filter(([k]) => k.includes('-hd/') === hd).map(([, v]) => v));
  const desktop = base + heaviest(true);
  const mobile = base + heaviest(false);
  return { base, desktop, mobile, worst: Math.max(desktop, mobile) };
}

function main() {
  if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`${DIST}/ is missing. Run \`pnpm crazy:build\` first.`);
    process.exit(1);
  }
  prune(DIST);

  const entries = walk(DIST).map((f) => {
    const rel = relative(DIST, f);
    const size = statSync(f).size;
    // What the player actually waits on, since their CDN serves the text assets compressed.
    const sent = COMPRESSIBLE.test(rel) ? gzipSync(readFileSync(f)).length : size;
    return { rel, size, sent };
  });
  const total = entries.reduce((n, e) => n + e.size, 0);
  const initial = initialSize(entries, 'size');
  const sent = initialSize(entries, 'sent');
  const index = entries.some((e) => e.rel === 'index.html');

  mkdirSync('release', { recursive: true });
  rmSync(OUT, { force: true });
  // -X drops the macOS extended attributes that would otherwise ride along as junk entries.
  execFileSync('zip', ['-r', '-X', '-q', join('..', OUT), '.'], { cwd: DIST, stdio: 'inherit' });

  const zipped = statSync(OUT).size;
  console.log(`\n${OUT}  (${mb(zipped)} compressed)`);
  console.log(`  files        ${entries.length} / ${MAX_FILES}`);
  console.log(`  total        ${mb(total)} / ${mb(MAX_TOTAL)}`);
  console.log(`  preloaded    ${mb(initial.base)}  (everything but the backdrops and the bosses)`);
  console.log(
    `  initial      ${mb(initial.desktop)} desktop, ${mb(initial.mobile)} mobile` +
      ` / ${mb(MAX_INITIAL)}  (preload plus the heaviest world)`,
  );
  console.log(`  over the wire ${mb(sent.desktop)} desktop, ${mb(sent.mobile)} mobile  (gzipped)`);

  const problems = [];
  if (!index) problems.push('index.html is not at the root of the bundle');
  if (entries.length > MAX_FILES) {
    problems.push(`${entries.length} files, over their ${MAX_FILES} cap`);
  }
  if (total > MAX_TOTAL) problems.push(`${mb(total)} total, over their ${mb(MAX_TOTAL)} cap`);
  if (initial.worst > MAX_INITIAL) {
    problems.push(`${mb(initial.worst)} initial download, over their ${mb(MAX_INITIAL)} cap`);
  }

  const biggest = [...entries].sort((a, b) => b.size - a.size).slice(0, 10);
  console.log('\nbiggest files');
  for (const e of biggest) console.log(`  ${mb(e.size).padStart(7)}  ${e.rel}`);

  if (problems.length) {
    console.error('\nblocking problems:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  // Their mobile home page is the one that cares about the 20MB line, and phones load the small
  // backdrop set, so that is the figure to check it against. Measured uncompressed, which is the
  // pessimistic read: what they clock is the download, which gzip makes smaller.
  const onMobile = initial.mobile;
  if (onMobile > MOBILE_HOME_INITIAL) {
    console.warn(
      `\nnote: ${mb(onMobile)} on mobile is over the ${mb(MOBILE_HOME_INITIAL)} their mobile home` +
        ' page needs. It passes review either way.',
    );
  } else {
    console.log(
      `\n${mb(onMobile)} on mobile is inside the ${mb(MOBILE_HOME_INITIAL)} mobile home cutoff.`,
    );
  }
}

main();
