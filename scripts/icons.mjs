// scripts/icons.mjs
//
// カルーセル用のラインアイコン集。satoriは <img src="data:image/svg+xml;..."> で
// SVGを描画できるため、各アイコンを指定色のSVG文字列→data URIにして返す。
// 著作権フリー(自作の幾何学ライン)。resvgでラスタライズするため text要素は使わない。

const BODIES = {
  // 返礼品・ギフト
  gift:
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/><path d="M12 8v12"/><path d="M12 8S10.5 3.8 8 4.8 9 8 12 8Z"/><path d="M12 8s1.5-4.2 4-3.2S15 8 12 8Z"/>',
  // 書類・申請書
  document:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 13h8"/><path d="M8 17h6"/>',
  // カレンダー・締切
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  // 期限・時計
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  // お金・円
  yen: '<circle cx="12" cy="12" r="9"/><path d="M8 8l4 4 4-4"/><path d="M12 12v5.5"/><path d="M9 14h6"/><path d="M9 16.6h6"/>',
  // 還元率・パーセント
  percent: '<circle cx="7.5" cy="7.5" r="2.4"/><circle cx="16.5" cy="16.5" r="2.4"/><path d="M18 6 6 18"/>',
  // チェック(OK)
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6 5.2-5.2"/>',
  // 注意・警告
  alert:
    '<path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5"/><path d="M12 17.2h.01"/>',
  // 家・家計
  house:
    '<path d="M4 11 12 4l8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-6h4v6"/>',
  // ひらめき・ポイント
  bulb:
    '<path d="M9.5 18h5"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.2 1.1 2.4h5.4c0-1.2.4-1.8 1.1-2.4A6 6 0 0 0 12 3Z"/>',
  // 財布
  wallet:
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  // ランキング・グラフ
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  // 産地・場所
  pin: '<path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
};

/** アイコンのSVG文字列を返す(指定色のライン) */
export function iconSvg(name, color = '#0F766E', strokeWidth = 1.8) {
  const body = BODIES[name];
  if (!body) throw new Error(`未知のアイコン名: ${name}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `${body}</svg>`
  );
}

/** satoriの<img src>に渡せる data URI を返す */
export function iconDataUri(name, color = '#0F766E', strokeWidth = 1.8) {
  const svg = iconSvg(name, color, strokeWidth);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export const ICON_NAMES = Object.keys(BODIES);
