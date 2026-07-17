// site/scripts/prepare.mjs
//
// ビルド前処理: リポジトリルートの content/ と docs/posts/ から記事データを
// 集約し、site/ 配下に書き出す。site/ 配下以外には一切書き込まない
// (親ディレクトリの content/ docs/ scripts/ は読み取り専用)。
//
// 出力:
//   site/src/data/articles.generated.json … 記事メタ+スライド+出典など
//   site/public/posts/<slug>/*.jpg         … カルーセル画像のコピー
//   site/src/lib/icons.mjs                 … ../scripts/icons.mjs のコピー
//
// 使い方: node scripts/prepare.mjs

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(SITE_ROOT, '..');

const POSTED_DIR = join(REPO_ROOT, 'content', 'posted');
const QUEUE_DIR = join(REPO_ROOT, 'content', 'queue');
const DOCS_POSTS_DIR = join(REPO_ROOT, 'docs', 'posts');
const ICONS_SRC = join(REPO_ROOT, 'scripts', 'icons.mjs');

const OUT_DATA_DIR = join(SITE_ROOT, 'src', 'data');
const OUT_DATA_FILE = join(OUT_DATA_DIR, 'articles.generated.json');
const OUT_POSTS_DIR = join(SITE_ROOT, 'public', 'posts');
const OUT_ICONS_FILE = join(SITE_ROOT, 'src', 'lib', 'icons.mjs');

/** ファイル名 "YYYY-MM-DD-<slug>.json" から日付文字列を取り出す */
function dateFromFilename(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return m ? m[1] : null;
}

function readJsonDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const post = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      return { post, filename: f };
    });
}

function countSlideImages(slug) {
  const dir = join(DOCS_POSTS_DIR, slug);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => /^\d+\.jpe?g$/i.test(f)).length;
}

function copyPostImages(slug) {
  const srcDir = join(DOCS_POSTS_DIR, slug);
  const destDir = join(OUT_POSTS_DIR, slug);
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  for (const f of readdirSync(srcDir)) {
    const srcFile = join(srcDir, f);
    if (statSync(srcFile).isFile()) {
      copyFileSync(srcFile, join(destDir, f));
    }
  }
}

function buildArticles() {
  const posted = readJsonDir(POSTED_DIR);
  const queue = readJsonDir(QUEUE_DIR);

  // slugで重複排除。postedを優先。
  const bySlug = new Map();

  for (const { post, filename } of queue) {
    const date = post.posted_at
      ? post.posted_at.slice(0, 10)
      : dateFromFilename(filename) ?? '1970-01-01';
    bySlug.set(post.slug, { post, date, source: 'queue' });
  }
  for (const { post, filename } of posted) {
    const date = post.posted_at
      ? post.posted_at.slice(0, 10)
      : dateFromFilename(filename) ?? '1970-01-01';
    bySlug.set(post.slug, { post, date, source: 'posted' }); // posted優先で上書き
  }

  const articles = [];
  for (const { post, date, source } of bySlug.values()) {
    const imageCount = countSlideImages(post.slug);
    if (imageCount === 0) {
      // docs/posts/<slug>/01.jpg が無い記事は記事化しない
      continue;
    }
    copyPostImages(post.slug);

    articles.push({
      slug: post.slug,
      title: post.title,
      caption: post.caption,
      hashtags: post.hashtags ?? [],
      affiliate: Boolean(post.affiliate),
      sources: post.sources ?? [],
      slides: post.slides ?? [],
      imageCount,
      date,
      status: source, // 'posted' | 'queue'
    });
  }

  // 新しい順
  articles.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

  return articles;
}

function main() {
  mkdirSync(OUT_DATA_DIR, { recursive: true });
  mkdirSync(OUT_POSTS_DIR, { recursive: true });
  mkdirSync(dirname(OUT_ICONS_FILE), { recursive: true });

  const articles = buildArticles();
  writeFileSync(OUT_DATA_FILE, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`articles.generated.json: ${articles.length}件 (${articles.map((a) => a.slug).join(', ')})`);

  if (!existsSync(ICONS_SRC)) {
    throw new Error(`icons.mjs が見つかりません: ${ICONS_SRC}`);
  }
  copyFileSync(ICONS_SRC, OUT_ICONS_FILE);
  console.log(`icons.mjs をコピーしました: ${OUT_ICONS_FILE}`);

  console.log('✅ prepare.mjs 完了');
}

main();
