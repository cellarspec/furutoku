// scripts/check-content.mjs
//
// content/queue/*.json の品質ゲート。違反があれば非0終了し、投稿を止める。
// 検証内容:
//   1. スキーマ適合(必須フィールド、スライド型、枚数2〜10)
//   2. 文字数上限(レイアウト崩れ防止。上限は PIPELINE.md と対応)
//   3. NG表現(断定的利益表示=景表法/金商法系ガード、ポイント訴求=2025年10月の
//      ポータルサイト経由ポイント付与禁止に伴い訴求禁止)
//   4. sources 必須(公式一次ソースURL 1件以上)
//   5. affiliate=true の場合、caption に PR 表記があること(ステマ規制対応)
//   6. 絵文字などsatoriで描画できない文字がスライド本文に無いこと(captionは可)

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_DIR = join(ROOT, 'content/queue');

const LIMITS = {
  coverKicker: 20,
  coverTitle: 36, // 改行含む合計。1行あたりは12文字程度を推奨
  coverTitleLine: 13,
  coverSub: 44,
  heading: 24,
  itemTitle: 30,
  itemBody: 64,
  itemsPerSlide: 4,
  noteBody: 90,
  noteFootnote: 80,
  ctaTitle: 30,
  ctaBody: 90,
  caption: 1800, // ハッシュタグと合わせてInstagram上限2200に収める
  hashtags: 25,
  slidesMin: 2, // Instagramカルーセルの最小枚数
  slidesMax: 10,
};

// 断定的な利益表示(景表法・広告表現ガイドライン系)
const NG_PATTERNS = [
  [/必ず(儲|得|お得|トク|増え)/u, '断定表現(必ず〜)'],
  [/絶対(に)?(儲|得|お得|トク|損しない)/u, '断定表現(絶対〜)'],
  [/確実に(儲|増え|得)/u, '断定表現(確実に〜)'],
  [/元本保証/u, '断定表現(元本保証)'],
  [/損(は|を)?しません/u, '断定表現(損しません)'],
  // 2025年10月からポータルサイトの寄付者向けポイント付与は制度上禁止。
  // 誤情報になるため訴求自体を禁止する。
  [/ポイント(還元|付与|バック|がもらえる|お得)/u, 'ポイント訴求(2025年10月以降は制度上不可)'],
  [/ポイ活.{0,6}(ふるさと納税|寄付)/u, 'ポイント訴求'],
];

// スライド本文に使える文字(絵文字はsatoriで描画されないため禁止)
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const errors = [];
function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}

function checkLen(file, label, value, limit) {
  if (value === undefined || value === null) return;
  const len = [...String(value)].length;
  if (len > limit) err(file, `${label} が長すぎます (${len} > ${limit}): "${String(value).slice(0, 30)}…"`);
}

function checkNg(file, label, value) {
  if (!value) return;
  for (const [re, name] of NG_PATTERNS) {
    if (re.test(String(value))) err(file, `${label} にNG表現 [${name}]: "${String(value).slice(0, 40)}"`);
  }
}

function checkSlideText(file, label, value) {
  if (!value) return;
  if (EMOJI_RE.test(String(value))) err(file, `${label} に絵文字があります(スライドでは描画不可): "${String(value).slice(0, 30)}"`);
  checkNg(file, label, value);
}

function checkPost(file, post) {
  // --- スキーマ ---
  if (!post.slug || !/^[a-z0-9-]+$/.test(post.slug)) err(file, 'slug は英小文字・数字・ハイフンで必須です');
  if (!post.title) err(file, 'title は必須です');
  if (typeof post.caption !== 'string' || post.caption.trim() === '') err(file, 'caption は必須です');
  if (!Array.isArray(post.hashtags)) err(file, 'hashtags は配列で必須です');
  if (typeof post.affiliate !== 'boolean') err(file, 'affiliate は boolean で必須です');
  if (!Array.isArray(post.sources) || post.sources.length === 0) {
    err(file, 'sources に公式一次ソースURLが1件以上必要です');
  } else {
    for (const u of post.sources) {
      try {
        new URL(u);
      } catch {
        err(file, `sources に不正なURL: ${u}`);
      }
    }
  }
  if (!Array.isArray(post.slides) || post.slides.length < LIMITS.slidesMin || post.slides.length > LIMITS.slidesMax) {
    err(file, `slides は ${LIMITS.slidesMin}〜${LIMITS.slidesMax} 枚である必要があります`);
    return;
  }
  if (post.slides[0].type !== 'cover') err(file, '1枚目は type=cover にしてください');
  if (post.slides[post.slides.length - 1].type !== 'cta') err(file, '最終枚は type=cta にしてください');

  // --- スライドごと ---
  post.slides.forEach((s, i) => {
    const at = `slides[${i}](${s.type})`;
    switch (s.type) {
      case 'cover':
        if (!s.title) err(file, `${at}: title 必須`);
        checkLen(file, `${at}.kicker`, s.kicker, LIMITS.coverKicker);
        checkLen(file, `${at}.title`, (s.title ?? '').replace(/\n/g, ''), LIMITS.coverTitle);
        for (const line of String(s.title ?? '').split('\n')) {
          checkLen(file, `${at}.title の1行`, line, LIMITS.coverTitleLine);
        }
        checkLen(file, `${at}.sub`, s.sub, LIMITS.coverSub);
        [s.kicker, s.title, s.sub].forEach((v) => checkSlideText(file, at, v));
        break;
      case 'list':
      case 'steps':
        if (!s.heading) err(file, `${at}: heading 必須`);
        checkLen(file, `${at}.heading`, s.heading, LIMITS.heading);
        if (!Array.isArray(s.items) || s.items.length === 0) {
          err(file, `${at}: items 必須`);
          break;
        }
        if (s.items.length > LIMITS.itemsPerSlide) err(file, `${at}: itemsは${LIMITS.itemsPerSlide}件まで(あふれ防止)`);
        s.items.forEach((it, j) => {
          if (!it.title) err(file, `${at}.items[${j}]: title 必須`);
          checkLen(file, `${at}.items[${j}].title`, it.title, LIMITS.itemTitle);
          checkLen(file, `${at}.items[${j}].body`, it.body, LIMITS.itemBody);
          checkSlideText(file, `${at}.items[${j}]`, it.title);
          checkSlideText(file, `${at}.items[${j}]`, it.body);
        });
        checkSlideText(file, at, s.heading);
        break;
      case 'note':
        if (!s.heading || !s.body) err(file, `${at}: heading/body 必須`);
        checkLen(file, `${at}.heading`, s.heading, LIMITS.heading);
        checkLen(file, `${at}.body`, (s.body ?? '').replace(/\n/g, ''), LIMITS.noteBody);
        checkLen(file, `${at}.footnote`, s.footnote, LIMITS.noteFootnote);
        [s.heading, s.body, s.footnote].forEach((v) => checkSlideText(file, at, v));
        break;
      case 'cta':
        if (!s.title || !s.body) err(file, `${at}: title/body 必須`);
        checkLen(file, `${at}.title`, (s.title ?? '').replace(/\n/g, ''), LIMITS.ctaTitle);
        checkLen(file, `${at}.body`, s.body, LIMITS.ctaBody);
        [s.title, s.body].forEach((v) => checkSlideText(file, at, v));
        break;
      default:
        err(file, `${at}: 未知のtype`);
    }
  });

  // --- caption / hashtags ---
  checkLen(file, 'caption', post.caption, LIMITS.caption);
  checkNg(file, 'caption', post.caption);
  if (post.hashtags?.length > LIMITS.hashtags) err(file, `hashtagsは${LIMITS.hashtags}個まで`);
  for (const tag of post.hashtags ?? []) {
    if (!/^#\S+$/.test(tag)) err(file, `hashtags は "#〜" 形式で: ${tag}`);
  }

  // --- ステマ規制: アフィリエイト投稿はPR表記必須 ---
  if (post.affiliate === true) {
    const cap = post.caption ?? '';
    if (!(cap.includes('#PR') || cap.includes('PR】')) || !cap.includes('アフィリエイト広告')) {
      err(file, 'affiliate=true の投稿は caption に「#PR」(または【PR】)と「アフィリエイト広告を含みます」の明記が必須です(ステマ規制)');
    }
  }
}

function main() {
  if (!existsSync(QUEUE_DIR)) {
    console.log('content/queue/ がありません。検証対象なし。');
    return;
  }
  const files = readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort();
  const slugs = new Set();
  for (const f of files) {
    let post;
    try {
      post = JSON.parse(readFileSync(join(QUEUE_DIR, f), 'utf-8'));
    } catch (e) {
      err(f, `JSONが不正です: ${e.message}`);
      continue;
    }
    if (post.slug) {
      if (slugs.has(post.slug)) err(f, `slug重複: ${post.slug}`);
      slugs.add(post.slug);
    }
    checkPost(f, post);
  }

  if (errors.length > 0) {
    console.error(`❌ 品質ゲートNG (${errors.length}件):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✅ 品質ゲートOK (${files.length}ファイル検証)`);
}

main();
