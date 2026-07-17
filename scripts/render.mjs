// scripts/render.mjs
//
// content/queue/*.json のカルーセル定義を Instagram 用 JPEG (1080x1350, 4:5) に
// レンダリングする。satori (flexboxレイアウト→SVG、テキストはパス化) →
// @resvg/resvg-js (SVG→PNG) → sharp (PNG→JPEG)。ブラウザ不要。
//
// 出力: docs/posts/<slug>/01.jpg, 02.jpg, ...
//   (docs/ 配下なのは raw.githubusercontent.com / 将来のGitHub Pagesで
//    そのまま公開URLになるため。post-instagram.mjs がこのURLをMetaに渡す)
//
// 使い方:
//   node scripts/render.mjs            # 未レンダリング分のみ
//   FORCE=1 node scripts/render.mjs    # 全件レンダリングし直し
//   node scripts/render.mjs <slug>     # 指定slugのみ(FORCE扱い)

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_DIR = join(ROOT, 'content/queue');
const OUT_DIR = join(ROOT, 'docs/posts');

export const WIDTH = 1080;
export const HEIGHT = 1350;

// ブランドカラー(全スライド共通)
const C = {
  bg: '#FBF8F3',        // ベース: 温かみのあるオフホワイト
  ink: '#26302E',       // 本文
  sub: '#6B7280',       // 補助テキスト
  teal: '#0F766E',      // アクセント主色
  tealDark: '#0B5A54',
  tealPale: '#E4F0EE',  // 薄アクセント背景
  orange: '#E4572E',    // 強調(保存推奨バッジ等)。多用しない
  card: '#FFFFFF',
  line: '#E5E0D8',
};

const BRAND = 'ふるとく研究室';

const fonts = [
  { name: 'Noto Sans JP', weight: 400, style: 'normal', data: readFileSync(join(ROOT, 'assets/fonts/NotoSansJP-Regular.otf')) },
  { name: 'Noto Sans JP', weight: 700, style: 'normal', data: readFileSync(join(ROOT, 'assets/fonts/NotoSansJP-Bold.otf')) },
];

// satori 用の要素ヘルパー(Reactは使わない)
function h(type, style = {}, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  // satoriは複数の子を持つ要素に明示的な display: flex を要求するため一律付与する
  // (テキストのみの子はそのまま文字列で渡し、テキストとして描画させる)
  if (!style.display) style = { display: 'flex', ...style };
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

/** 改行(\n)を行ごとの div に分解する(satoriの改行の揺れを避ける) */
function lines(text, style = {}) {
  return String(text)
    .split('\n')
    .map((line) => h('div', style, line));
}

// ---------------------------------------------------------------------------
// スライドの型ごとのレイアウト
// ---------------------------------------------------------------------------

function frame(children, { dark = false } = {}) {
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: dark ? C.teal : C.bg,
      fontFamily: 'Noto Sans JP',
      color: dark ? '#FFFFFF' : C.ink,
      padding: '64px 72px 56px',
    },
    ...children,
  );
}

function footer(page, total, { dark = false } = {}) {
  return h(
    'div',
    {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 'auto',
      paddingTop: 28,
      borderTop: `2px solid ${dark ? 'rgba(255,255,255,0.35)' : C.line}`,
    },
    h('div', { fontSize: 28, fontWeight: 700, color: dark ? 'rgba(255,255,255,0.9)' : C.teal }, BRAND),
    h('div', { fontSize: 28, color: dark ? 'rgba(255,255,255,0.8)' : C.sub }, `${page} / ${total}`),
  );
}

function coverSlide(s, page, total) {
  return frame(
    [
      h(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
        s.kicker
          ? h(
              'div',
              {
                fontSize: 34,
                fontWeight: 700,
                color: '#FFFFFF',
                backgroundColor: 'rgba(255,255,255,0.16)',
                border: '2px solid rgba(255,255,255,0.55)',
                borderRadius: 999,
                padding: '10px 30px',
              },
              s.kicker,
            )
          : h('div', {}),
        h(
          'div',
          {
            fontSize: 32,
            fontWeight: 700,
            color: '#FFFFFF',
            backgroundColor: C.orange,
            borderRadius: 12,
            padding: '10px 24px',
          },
          '保存推奨',
        ),
      ),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' },
        ...lines(s.title, { fontSize: 88, fontWeight: 700, lineHeight: 1.35 }),
        s.sub ? h('div', { fontSize: 40, marginTop: 36, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }, s.sub) : null,
      ),
      footer(page, total, { dark: true }),
    ],
    { dark: true },
  );
}

function heading(text) {
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', marginBottom: 40 },
    h('div', { fontSize: 54, fontWeight: 700, lineHeight: 1.4 }, text),
    h('div', { width: 120, height: 10, backgroundColor: C.teal, borderRadius: 5, marginTop: 18 }),
  );
}

function itemCard(children) {
  return h(
    'div',
    {
      display: 'flex',
      alignItems: 'flex-start',
      backgroundColor: C.card,
      borderRadius: 20,
      border: `2px solid ${C.line}`,
      padding: '30px 34px',
      marginBottom: 24,
    },
    ...children,
  );
}

function listSlide(s, page, total) {
  return frame([
    heading(s.heading),
    ...s.items.map((it) =>
      itemCard([
        h('div', { width: 16, height: 16, borderRadius: 8, backgroundColor: C.teal, marginTop: 20, marginRight: 26 }),
        h(
          'div',
          { display: 'flex', flexDirection: 'column', flex: 1 },
          h('div', { fontSize: 40, fontWeight: 700, lineHeight: 1.45 }, it.title),
          it.body ? h('div', { fontSize: 32, color: C.sub, lineHeight: 1.55, marginTop: 10 }, it.body) : null,
        ),
      ]),
    ),
    footer(page, total),
  ]);
}

function stepsSlide(s, page, total, stepOffset = 0) {
  return frame([
    heading(s.heading),
    ...s.items.map((it, i) =>
      itemCard([
        h(
          'div',
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: C.teal,
            color: '#FFFFFF',
            fontSize: 36,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 28,
            flexShrink: 0,
          },
          String(stepOffset + i + 1),
        ),
        h(
          'div',
          { display: 'flex', flexDirection: 'column', flex: 1 },
          h('div', { fontSize: 40, fontWeight: 700, lineHeight: 1.45 }, it.title),
          it.body ? h('div', { fontSize: 32, color: C.sub, lineHeight: 1.55, marginTop: 10 }, it.body) : null,
        ),
      ]),
    ),
    footer(page, total),
  ]);
}

function noteSlide(s, page, total) {
  return frame([
    heading(s.heading),
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.tealPale,
        borderRadius: 24,
        padding: '48px 52px',
        marginTop: 10,
      },
      ...lines(s.body, { fontSize: 42, lineHeight: 1.7, fontWeight: 700, color: C.tealDark }),
    ),
    s.footnote ? h('div', { fontSize: 30, color: C.sub, lineHeight: 1.6, marginTop: 36 }, s.footnote) : null,
    footer(page, total),
  ]);
}

function ctaSlide(s, page, total, meta) {
  const sourceLabel =
    meta.sources && meta.sources.length > 0
      ? `出典: ${[...new Set(meta.sources.map((u) => new URL(u).hostname.replace(/^www\./, '')))].join(' / ')}`
      : null;
  return frame(
    [
      h(
        'div',
        { display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' },
        ...lines(s.title, { fontSize: 72, fontWeight: 700, lineHeight: 1.4 }),
        h('div', { fontSize: 40, marginTop: 40, lineHeight: 1.6, color: 'rgba(255,255,255,0.94)' }, s.body),
        h(
          'div',
          {
            display: 'flex',
            alignItems: 'center',
            marginTop: 56,
            backgroundColor: 'rgba(255,255,255,0.14)',
            border: '2px solid rgba(255,255,255,0.5)',
            borderRadius: 20,
            padding: '26px 34px',
            fontSize: 36,
            fontWeight: 700,
          },
          '保存して寄付シーズンに見返してね',
        ),
      ),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', marginBottom: 8 },
        sourceLabel ? h('div', { fontSize: 26, color: 'rgba(255,255,255,0.75)', marginBottom: 10 }, sourceLabel) : null,
        meta.affiliate
          ? h('div', { fontSize: 26, color: 'rgba(255,255,255,0.75)', marginBottom: 10 }, '本投稿はアフィリエイト広告(PR)を含みます')
          : null,
      ),
      footer(page, total, { dark: true }),
    ],
    { dark: true },
  );
}

function renderSlideTree(slide, page, total, meta, stepOffset) {
  switch (slide.type) {
    case 'cover':
      return coverSlide(slide, page, total);
    case 'list':
      return listSlide(slide, page, total);
    case 'steps':
      return stepsSlide(slide, page, total, stepOffset);
    case 'note':
      return noteSlide(slide, page, total);
    case 'cta':
      return ctaSlide(slide, page, total, meta);
    default:
      throw new Error(`未知のスライドtype: ${slide.type}`);
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function renderPost(post) {
  const outDir = join(OUT_DIR, post.slug);
  mkdirSync(outDir, { recursive: true });

  const total = post.slides.length;
  // steps スライドが複数ページに分割されている場合に番号を通しにする
  let stepCounter = 0;

  for (let i = 0; i < total; i++) {
    const slide = post.slides[i];
    const stepOffset = slide.type === 'steps' ? stepCounter : 0;
    if (slide.type === 'steps') stepCounter += slide.items.length;

    const tree = renderSlideTree(slide, i + 1, total, post, stepOffset);
    let svg;
    try {
      svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
    } catch (e) {
      throw new Error(`slug=${post.slug} slide[${i}](type=${slide.type}) のレンダリングに失敗: ${e.message}`);
    }
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: false }, // satoriがテキストをパス化するためフォント不要
    })
      .render()
      .asPng();
    const file = join(outDir, `${String(i + 1).padStart(2, '0')}.jpg`);
    // Instagram APIはJPEGのみ受付。テキスト主体なので高品質・4:4:4で滲みを防ぐ
    await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(file);
  }
  return total;
}

function isRendered(post) {
  const outDir = join(OUT_DIR, post.slug);
  if (!existsSync(outDir)) return false;
  for (let i = 0; i < post.slides.length; i++) {
    if (!existsSync(join(outDir, `${String(i + 1).padStart(2, '0')}.jpg`))) return false;
  }
  return true;
}

async function main() {
  const onlySlug = process.argv[2];
  const force = process.env.FORCE === '1' || Boolean(onlySlug);

  if (!existsSync(QUEUE_DIR)) {
    console.log('content/queue/ がありません。何もしません。');
    return;
  }
  const files = readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  let rendered = 0;
  for (const f of files) {
    const post = JSON.parse(readFileSync(join(QUEUE_DIR, f), 'utf-8'));
    if (onlySlug && post.slug !== onlySlug) continue;
    if (!force && isRendered(post)) {
      console.log(`スキップ(レンダリング済み): ${post.slug}`);
      continue;
    }
    const n = await renderPost(post);
    rendered++;
    console.log(`レンダリング完了: ${post.slug} (${n}枚)`);
  }
  console.log(`✅ ${rendered}件レンダリングしました`);
}

main().catch((e) => {
  console.error(`レンダリング失敗: ${e.stack ?? e.message}`);
  process.exitCode = 1;
});
