// site/scripts/check-site.mjs
//
// サイトの手書きコピー(src/**/*.astro)を対象にした品質ゲート。
// ../scripts/check-content.mjs の NG_PATTERNS(断定的な利益表示・ポイント訴求の禁止)の
// 思想を流用し、サイト側の固定ページ・コンポーネント文言にも同じ基準を適用する。
// あわせて Footer.astro に PR表記が存在することを検証する(ステマ規制対応の常時表示)。
//
// 使い方: node scripts/check-site.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(SITE_ROOT, 'src');

// 断定的な利益表示・ポイント訴求の禁止(../scripts/check-content.mjs と同じ思想)
const NG_PATTERNS = [
  [/必ず(儲|得|お得|トク|増え)/u, '断定表現(必ず〜)'],
  [/絶対(に)?(儲|得|お得|トク|損しない)/u, '断定表現(絶対〜)'],
  [/確実に(儲|増え|得)/u, '断定表現(確実に〜)'],
  [/元本保証/u, '断定表現(元本保証)'],
  [/損(は|を)?しません/u, '断定表現(損しません)'],
  // 2025年10月からポータルサイト経由の寄付者向けポイント付与は制度上禁止。
  [/ポイント(還元|付与|バック|がもらえる|お得)/u, 'ポイント訴求(2025年10月以降は制度上不可)'],
  [/ポイ活.{0,6}(ふるさと納税|寄付)/u, 'ポイント訴求'],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.astro')) out.push(p);
  }
  return out;
}

function main() {
  const errors = [];
  const files = walk(SRC_DIR);

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    for (const [re, label] of NG_PATTERNS) {
      if (re.test(text)) {
        errors.push(`${file}: NG表現 [${label}]`);
      }
    }
  }

  // Footer.astro に常時PR表記があることを確認(ステマ規制対応)
  const footerPath = join(SRC_DIR, 'components', 'Footer.astro');
  try {
    const footerText = readFileSync(footerPath, 'utf-8');
    if (!(footerText.includes('PR') && footerText.includes('アフィリエイト'))) {
      errors.push(
        `${footerPath}: Footerに常時PR表記(「PR」および「アフィリエイト」の文言)が見つかりません`,
      );
    }
  } catch {
    errors.push(`${footerPath}: Footer.astro が見つかりません`);
  }

  // Header.astro にも常時PR表記があることを確認
  const headerPath = join(SRC_DIR, 'components', 'Header.astro');
  try {
    const headerText = readFileSync(headerPath, 'utf-8');
    if (!(headerText.includes('PR') && headerText.includes('アフィリエイト'))) {
      errors.push(
        `${headerPath}: Headerに常時PR表記(「PR」および「アフィリエイト」の文言)が見つかりません`,
      );
    }
  } catch {
    errors.push(`${headerPath}: Header.astro が見つかりません`);
  }

  if (errors.length > 0) {
    console.error('❌ check-site.mjs: 検証エラー');
    for (const e of errors) console.error(` - ${e}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ check-site.mjs: ${files.length}ファイルを検証、問題なし`);
}

main();
