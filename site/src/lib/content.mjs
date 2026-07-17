// site/src/lib/content.mjs
//
// articles.generated.json (prepare.mjsが生成) のヘルパー関数群。
// このファイル自体はコミット対象(site/scripts/prepare.mjsとは別物)。

import articles from '../data/articles.generated.json';

/** 新しい順の記事一覧を返す(prepare.mjsで既にソート済み) */
export function getAllArticles() {
  return articles;
}

/** slugから記事を1件取得する */
export function getArticleBySlug(slug) {
  return articles.find((a) => a.slug === slug) ?? null;
}

/** 日付文字列 "YYYY-MM-DD" を日本語表記に整形する */
export function formatDateJa(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}
