// scripts/render.mjs
//
// content/queue/*.json のカルーセル定義を Instagram 用 JPEG (1080x1350, 4:5) に
// レンダリングする。satori (flexboxレイアウト→SVG) → @resvg/resvg-js (→PNG) →
// sharp (→JPEG)。ブラウザ不要。
//
// ビジュアル方針: 文字の羅列を避け、アイコン・比較バー・数字タイルなどの図解で
// 「保存したくなる」比較コンテンツにする。素材はすべて自作の描画(著作権リスクなし)。
// 任意で assets/photos/<name>.jpg の商用フリー写真をカバー背景に合成できる。
//
// 出力: docs/posts/<slug>/01.jpg, 02.jpg, ...
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
import { iconDataUri } from './icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_DIR = join(ROOT, 'content/queue');
const OUT_DIR = join(ROOT, 'docs/posts');
const PHOTO_DIR = join(ROOT, 'assets/photos');

export const WIDTH = 1080;
export const HEIGHT = 1350;

// ブランドカラー
const C = {
  bg: '#FBF8F3', // ベース(温かいオフホワイト)
  ink: '#1F2A28',
  sub: '#6E7671',
  teal: '#0F766E', // 深いティール(背景・見出し)
  tealDark: '#0B5A54',
  tealMark: '#0D9488', // 明るめティール(データバー)
  tealPale: '#E4F0EE',
  orange: '#E4572E', // 強調(1位・保存バッジ)
  orangePale: '#FBEAE3',
  card: '#FFFFFF',
  line: '#E7E1D8',
  white70: 'rgba(255,255,255,0.72)',
  white55: 'rgba(255,255,255,0.55)',
};

const BRAND = 'ふるとく研究室';

const fonts = [
  { name: 'Noto Sans JP', weight: 400, style: 'normal', data: readFileSync(join(ROOT, 'assets/fonts/NotoSansJP-Regular.otf')) },
  { name: 'Noto Sans JP', weight: 700, style: 'normal', data: readFileSync(join(ROOT, 'assets/fonts/NotoSansJP-Bold.otf')) },
];

// satori 要素ヘルパー(Reactは使わない)。複数子には display:flex を自動付与。
function h(type, style = {}, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  if (!style.display && type === 'div') style = { display: 'flex', ...style };
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

function lines(text, style = {}) {
  return String(text)
    .split('\n')
    .map((line) => h('div', style, line));
}

function img(src, size, style = {}) {
  return { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, ...style } } };
}

function iconImg(name, color, size, strokeWidth = 1.8) {
  return img(iconDataUri(name, color, strokeWidth), size);
}

function photoDataUri(name) {
  const p = join(PHOTO_DIR, name);
  if (!existsSync(p)) return null;
  const ext = name.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------

function frame(children, { dark = false, bgImage = null } = {}) {
  const style = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Noto Sans JP',
    color: dark ? '#FFFFFF' : C.ink,
    padding: '68px 72px 56px',
    position: 'relative',
  };
  if (bgImage) {
    style.backgroundImage = `url(${bgImage})`;
    style.backgroundSize = '1080px 1350px';
  } else if (dark) {
    style.backgroundColor = C.teal;
    // 奥行きを出す放射グラデーション
    style.backgroundImage = `radial-gradient(1100px 700px at 18% 8%, ${C.teal} 0%, ${C.tealDark} 78%)`;
  } else {
    style.backgroundColor = C.bg;
  }
  return h('div', style, ...children);
}

// 暗い写真オーバーレイ(文字可読性のため)
function overlay() {
  return h('div', {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: 'linear-gradient(180deg, rgba(11,90,84,0.55) 0%, rgba(11,90,84,0.82) 100%)',
  });
}

function footer(page, total, { dark = false } = {}) {
  return h(
    'div',
    {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 'auto',
      paddingTop: 26,
      borderTop: `2px solid ${dark ? C.white55 : C.line}`,
    },
    h(
      'div',
      { display: 'flex', alignItems: 'center' },
      h('div', {
        width: 22,
        height: 22,
        borderRadius: 6,
        backgroundColor: dark ? '#FFFFFF' : C.teal,
        marginRight: 14,
      }),
      h('div', { fontSize: 27, fontWeight: 700, color: dark ? '#FFFFFF' : C.teal }, BRAND),
    ),
    h('div', { fontSize: 26, color: dark ? C.white70 : C.sub }, `${page} / ${total}`),
  );
}

// 見出し(アイコンチップ + タイトル + 下線)
function heading(text, iconName) {
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', marginBottom: 36 },
    h(
      'div',
      { display: 'flex', alignItems: 'center' },
      iconName
        ? h(
            'div',
            {
              width: 68,
              height: 68,
              borderRadius: 18,
              backgroundColor: C.tealPale,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 22,
            },
            iconImg(iconName, C.teal, 40, 1.9),
          )
        : null,
      h('div', { fontSize: 52, fontWeight: 700, lineHeight: 1.35, flex: 1 }, text),
    ),
    h('div', { width: 96, height: 9, backgroundColor: C.orange, borderRadius: 5, marginTop: 20 }),
  );
}

// ---------------------------------------------------------------------------
// スライド型
// ---------------------------------------------------------------------------

function coverSlide(s, page, total) {
  const bg = s.image ? photoDataUri(s.image) : null;
  const dark = true;
  return frame(
    [
      bg ? overlay() : null,
      h(
        'div',
        { display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' },
        // 上段: キッカー + 保存バッジ
        h(
          'div',
          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
          s.kicker
            ? h(
                'div',
                {
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  border: `2px solid ${C.white55}`,
                  borderRadius: 999,
                  padding: '10px 30px',
                },
                s.kicker,
              )
            : h('div', {}),
          h(
            'div',
            {
              display: 'flex',
              alignItems: 'center',
              fontSize: 30,
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: C.orange,
              borderRadius: 12,
              padding: '10px 22px',
            },
            '保存推奨',
          ),
        ),
        // 中央: アイコン + タイトル + サブ
        h(
          'div',
          { display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' },
          s.icon
            ? h(
                'div',
                {
                  width: 128,
                  height: 128,
                  borderRadius: 32,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  border: `2px solid ${C.white55}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 40,
                },
                iconImg(s.icon, '#FFFFFF', 72, 1.7),
              )
            : null,
          h('div', { display: 'flex', flexDirection: 'column' }, ...lines(s.title, { fontSize: 86, fontWeight: 700, lineHeight: 1.32 })),
          s.sub ? h('div', { fontSize: 38, marginTop: 34, color: C.white70, lineHeight: 1.5 }, s.sub) : null,
        ),
        footer(page, total, { dark }),
      ),
    ],
    { dark, bgImage: bg },
  );
}

function listSlide(s, page, total) {
  return frame([
    heading(s.heading, s.icon),
    h(
      'div',
      { display: 'flex', flexDirection: 'column' },
      ...s.items.map((it) =>
        h(
          'div',
          {
            display: 'flex',
            alignItems: 'flex-start',
            backgroundColor: C.card,
            borderRadius: 20,
            border: `2px solid ${C.line}`,
            borderLeft: `10px solid ${C.teal}`,
            padding: '28px 32px',
            marginBottom: 22,
          },
          h(
            'div',
            {
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: C.tealPale,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 24,
              flexShrink: 0,
            },
            iconImg(it.icon ?? 'check', C.teal, 34, 2),
          ),
          h(
            'div',
            { display: 'flex', flexDirection: 'column', flex: 1 },
            h('div', { fontSize: 39, fontWeight: 700, lineHeight: 1.4 }, it.title),
            it.body ? h('div', { fontSize: 31, color: C.sub, lineHeight: 1.55, marginTop: 8 }, it.body) : null,
          ),
        ),
      ),
    ),
    footer(page, total),
  ]);
}

function stepsSlide(s, page, total, stepOffset = 0) {
  return frame([
    heading(s.heading, s.icon),
    h(
      'div',
      { display: 'flex', flexDirection: 'column' },
      ...s.items.map((it, i) =>
        h(
          'div',
          {
            display: 'flex',
            alignItems: 'flex-start',
            backgroundColor: C.card,
            borderRadius: 20,
            border: `2px solid ${C.line}`,
            padding: '26px 32px',
            marginBottom: 22,
          },
          h(
            'div',
            {
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: C.teal,
              backgroundImage: `linear-gradient(135deg, ${C.tealMark}, ${C.tealDark})`,
              color: '#FFFFFF',
              fontSize: 36,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 26,
              flexShrink: 0,
            },
            String(stepOffset + i + 1),
          ),
          h(
            'div',
            { display: 'flex', flexDirection: 'column', flex: 1 },
            h('div', { fontSize: 39, fontWeight: 700, lineHeight: 1.4 }, it.title),
            it.body ? h('div', { fontSize: 31, color: C.sub, lineHeight: 1.55, marginTop: 8 }, it.body) : null,
          ),
        ),
      ),
    ),
    footer(page, total),
  ]);
}

// 比較バー(還元率・コスパなどのランキング)
function barsSlide(s, page, total) {
  const highlightTop = s.highlightTop !== false;
  const maxVal = Math.max(...s.items.map((it) => it.value));
  const unit = s.unit ?? '';
  return frame([
    heading(s.heading, s.icon ?? 'chart'),
    h(
      'div',
      { display: 'flex', flexDirection: 'column' },
      ...s.items.map((it, i) => {
        const top = highlightTop && i === 0;
        const fill = top ? C.orange : C.tealMark;
        const w = Math.max(8, Math.round((it.value / maxVal) * 100));
        return h(
          'div',
          { display: 'flex', flexDirection: 'column', marginBottom: 24 },
          // ラベル行: 順位 + 名前 + 値
          h(
            'div',
            { display: 'flex', alignItems: 'center', marginBottom: 12 },
            h(
              'div',
              {
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: top ? C.orange : C.teal,
                color: '#FFFFFF',
                fontSize: 26,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 18,
                flexShrink: 0,
              },
              String(i + 1),
            ),
            h('div', { fontSize: 33, fontWeight: 700, flex: 1, lineHeight: 1.35 }, it.label),
            h('div', { fontSize: 36, fontWeight: 700, color: fill, marginLeft: 16, flexShrink: 0 }, `${it.value}${unit}`),
          ),
          // バー
          h(
            'div',
            { display: 'flex', width: '100%', height: 30, backgroundColor: C.tealPale, borderRadius: 8 },
            h('div', { width: `${w}%`, height: 30, backgroundColor: fill, borderRadius: 8 }),
          ),
          it.note ? h('div', { fontSize: 26, color: C.sub, marginTop: 8 }, it.note) : null,
        );
      }),
    ),
    s.footnote ? h('div', { fontSize: 26, color: C.sub, lineHeight: 1.5, marginTop: 'auto', marginBottom: 18 }, s.footnote) : null,
    footer(page, total),
  ]);
}

// 数字タイル(制度の要点を大きな数字で)
function statSlide(s, page, total) {
  const tiles = s.stats;
  const many = tiles.length > 1;
  return frame([
    heading(s.heading, s.icon ?? 'yen'),
    h(
      'div',
      {
        display: 'flex',
        flexDirection: many ? 'row' : 'column',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: many ? 20 : 'auto',
        marginBottom: many ? 20 : 'auto',
      },
      ...tiles.map((t) =>
        h(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.card,
            border: `2px solid ${C.line}`,
            borderTop: `10px solid ${C.teal}`,
            borderRadius: 24,
            padding: many ? '44px 30px' : '60px 48px',
            margin: 12,
            width: many ? 400 : '100%',
          },
          h('div', { fontSize: many ? 78 : 124, fontWeight: 700, color: C.teal, lineHeight: 1.1, whiteSpace: 'nowrap' }, t.value),
          h('div', { fontSize: many ? 31 : 40, color: C.ink, marginTop: 18, textAlign: 'center', lineHeight: 1.45 }, t.label),
        ),
      ),
    ),
    s.note ? h('div', { fontSize: 30, color: C.sub, lineHeight: 1.6, marginTop: 10 }, s.note) : null,
    footer(page, total),
  ]);
}

function noteSlide(s, page, total) {
  return frame([
    heading(s.heading, s.icon ?? 'alert'),
    h(
      'div',
      {
        display: 'flex',
        alignItems: 'flex-start',
        backgroundColor: C.tealPale,
        borderLeft: `12px solid ${C.orange}`,
        borderRadius: 20,
        padding: '44px 46px',
        marginTop: 6,
      },
      h(
        'div',
        {
          width: 72,
          height: 72,
          borderRadius: 18,
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 28,
          flexShrink: 0,
        },
        iconImg(s.icon ?? 'alert', C.orange, 42, 2),
      ),
      h('div', { display: 'flex', flexDirection: 'column', flex: 1 }, ...lines(s.body, { fontSize: 40, lineHeight: 1.6, fontWeight: 700, color: C.tealDark })),
    ),
    s.footnote ? h('div', { fontSize: 29, color: C.sub, lineHeight: 1.6, marginTop: 32 }, s.footnote) : null,
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
        h('div', { display: 'flex', flexDirection: 'column' }, ...lines(s.title, { fontSize: 72, fontWeight: 700, lineHeight: 1.38 })),
        h('div', { fontSize: 38, marginTop: 34, lineHeight: 1.6, color: C.white70 }, s.body),
        // プロフィール誘導ピル
        h(
          'div',
          {
            display: 'flex',
            alignItems: 'center',
            marginTop: 52,
            backgroundColor: '#FFFFFF',
            borderRadius: 999,
            padding: '22px 38px',
            alignSelf: 'flex-start',
          },
          h('div', { fontSize: 34, fontWeight: 700, color: C.teal }, 'プロフィールのリンクへ'),
          h('div', { fontSize: 40, fontWeight: 700, color: C.orange, marginLeft: 16 }, '→'),
        ),
        h('div', { fontSize: 30, color: C.white70, marginTop: 26 }, '保存して寄付シーズンに見返してね'),
      ),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', marginBottom: 8 },
        sourceLabel ? h('div', { fontSize: 25, color: C.white55, marginBottom: 8 }, sourceLabel) : null,
        meta.affiliate ? h('div', { fontSize: 25, color: C.white55, marginBottom: 8 }, '本投稿はアフィリエイト広告(PR)を含みます') : null,
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
    case 'bars':
      return barsSlide(slide, page, total);
    case 'stat':
      return statSlide(slide, page, total);
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
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng();
    const file = join(outDir, `${String(i + 1).padStart(2, '0')}.jpg`);
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
  const files = readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort();

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
