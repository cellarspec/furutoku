// scripts/post-instagram.mjs
//
// Instagram Graph API カルーセル自動投稿。外部依存ゼロ(Node標準のみ)。
// cellar-db の post-threads.mjs のパターン(2段階投稿+ポーリング+リトライ)を踏襲。
//
// 動作:
//   1. content/queue/*.json をファイル名順に読み、先頭の1件を投稿する。
//      画像は docs/posts/<slug>/NN.jpg が「公開URLとして取得可能」であることを
//      事前検証する(GitHubへpush済みであることが前提。Metaが画像をURLから取得するため)。
//   2. 各画像の item container 作成 → CAROUSEL container 作成 → status_code が
//      FINISHED になるまでポーリング → publish(一時エラーはリトライ)。
//   3. 成功時は queue の JSON に posted_at / post_id を追記して content/posted/ へ移動。
//
// 環境変数:
//   IG_USER_ID       InstagramプロアカウントのユーザーID(数字)
//   IG_TOKEN         アクセストークン(長期ユーザートークン or 無期限ページトークン推奨)
//   IMAGE_BASE_URL   画像公開URLのベース(既定: raw.githubusercontent.com の main ブランチ)
//   IG_API_BASE      APIベースURL(既定: graph.instagram.com = Instagramログイン方式)
//   DRY_RUN=1        API呼び出しせず、queue先頭の投稿内容と画像URLの検証のみ(トークン不要)
//   REFRESH=1        投稿せず長期トークン(60日)を更新して `NEW_TOKEN=...` を出力
//                    (Instagramログイン方式は ig_refresh_token。アプリシークレット不要)
//   FORCE=1          直近投稿済みガード(6時間)を無視して投稿する
//
// 前提: 「Instagram API with Instagram Login」方式(Facebookページ不要)。
//       IG_TOKEN は Instagramユーザーの長期アクセストークン、IG_USER_ID は /me の user_id。

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_DIR = join(ROOT, 'content/queue');
const POSTED_DIR = join(ROOT, 'content/posted');
const API_BASE = process.env.IG_API_BASE ?? 'https://graph.instagram.com/v23.0';
const IMAGE_BASE_URL =
  process.env.IMAGE_BASE_URL ?? 'https://raw.githubusercontent.com/cellarspec/furutoku/main';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiCall(method, path, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url, { method, headers: { Connection: 'close' } });
  const bodyText = await res.text();
  let data = null;
  try {
    data = JSON.parse(bodyText);
  } catch {
    /* JSONでないレスポンスは bodyText をそのまま使う */
  }
  return { ok: res.ok, status: res.status, bodyText, data };
}

// ---------------------------------------------------------------------------
// queue
// ---------------------------------------------------------------------------
function loadQueueFiles() {
  if (!existsSync(QUEUE_DIR)) return [];
  return readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort();
}

// cron遅延中の手動実行と遅れて届いたcronが重なって同一スロットで二重投稿しないためのガード
const GUARD_HOURS = 6;
function recentlyPostedFile() {
  if (!existsSync(POSTED_DIR)) return null;
  const cutoff = Date.now() - GUARD_HOURS * 60 * 60 * 1000;
  for (const f of readdirSync(POSTED_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      const { posted_at } = JSON.parse(readFileSync(join(POSTED_DIR, f), 'utf-8'));
      if (posted_at && new Date(posted_at).getTime() > cutoff) return f;
    } catch {
      /* 壊れたJSONはガード判定から除外 */
    }
  }
  return null;
}

function imageUrls(post) {
  return post.slides.map(
    (_, i) => `${IMAGE_BASE_URL}/docs/posts/${post.slug}/${String(i + 1).padStart(2, '0')}.jpg`,
  );
}

function buildCaption(post) {
  const tags = (post.hashtags ?? []).join(' ');
  return tags ? `${post.caption}\n\n${tags}` : post.caption;
}

/** 画像がローカルに存在し、公開URLからも取得できることを確認する */
async function verifyImages(post, { checkRemote }) {
  for (let i = 0; i < post.slides.length; i++) {
    const local = join(ROOT, 'docs/posts', post.slug, `${String(i + 1).padStart(2, '0')}.jpg`);
    if (!existsSync(local)) {
      return { ok: false, reason: `ローカル画像がありません(render未実行): ${local}` };
    }
  }
  if (!checkRemote) return { ok: true };
  for (const url of imageUrls(post)) {
    const res = await fetch(url, { method: 'HEAD', headers: { Connection: 'close' } });
    if (!res.ok) {
      return {
        ok: false,
        reason: `公開URLから画像を取得できません (HTTP ${res.status}): ${url}\n  → GitHubへpush済みか、IMAGE_BASE_URLが正しいか確認してください`,
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Instagram Graph API
// ---------------------------------------------------------------------------

// リトライ設定。
// 2026-07-20 12:04 JSTの障害: raw.githubusercontent.com からの画像取得にMetaの
// フェッチャーが一時的に失敗し(code=9004)、3枚目のitem container作成が落ちて
// カルーセル投稿全体が失敗した(画像自体は01/02と形式上区別がつかず正常)。
// 既定3回試行(初回+リトライ2回)。IG_MAX_ATTEMPTSで上書き可能。
const MAX_ATTEMPTS = (() => {
  const n = Number(process.env.IG_MAX_ATTEMPTS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
})();

// 待機は20秒→60秒の指数バックオフ(倍率3)。rawの短時間連続アクセス制限からの
// 回復と、Metaのフェッチャー側の再試行間隔を見込んだ値。±20%のゆらぎを入れて
// 複数投稿ジョブが同時にリトライして再度輻輳するのを避ける。
const RETRY_BASE_DELAY_MS = 20000;
const RETRY_BACKOFF_FACTOR = 3;
function backoffDelayMs(attempt) {
  const base = RETRY_BASE_DELAY_MS * RETRY_BACKOFF_FACTOR ** (attempt - 1);
  const jitter = base * (Math.random() * 0.4 - 0.2); // ±20%
  return Math.round(base + jitter);
}

/**
 * Meta API のエラーが一時障害とみなしてリトライすべきかを判定する。
 * result: apiCall() の返り値と同じ形({ status, data })。
 *
 * リトライする:
 *   - code 9004 (media download failed。今回の障害。error_subcode 2207052)
 *   - code 1 / 2 (Metaの一時的な内部エラー)
 *   - code 24 / 9007 / is_transient===true (publish時の一時エラー。従来の
 *     publish個別リトライ―Threadsの「Media Not Found」対策と同じ―を踏襲)
 *   - HTTP 429 (レート制限)
 *   - HTTP 5xx
 * リトライしない:
 *   - code 190 (トークン無効) / code 200 (権限不足) などの認証・権限系
 *   - 上記以外の4xx(恒久的な失敗とみなす)
 */
export function isRetryableError({ status, data } = {}) {
  const code = data?.error?.code;
  if (code === 190 || code === 200) return false;
  if (
    code === 9004 ||
    code === 1 ||
    code === 2 ||
    code === 24 ||
    code === 9007 ||
    data?.error?.is_transient === true
  ) {
    return true;
  }
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
}

/**
 * fn(apiCall呼び出し)をリトライ付きで実行する。一時障害(isRetryableError)や
 * ネットワーク例外(fetch自体のthrow)はバックオフしながら再試行し、
 * 恒久的な失敗は即座に結果を返す。label はログ表示用(例: "item container 3枚目")。
 */
async function callWithRetry(fn, label) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await fn();
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      const delay = backoffDelayMs(attempt);
      console.log(
        `${label} 失敗 (network error): ${err.message}: ${Math.round(delay / 1000)}秒後に再試行します (${attempt + 1}/${MAX_ATTEMPTS}回目)`,
      );
      await sleep(delay);
      continue;
    }
    if (result.ok) return result;
    if (attempt === MAX_ATTEMPTS || !isRetryableError(result)) return result;
    const code = result.data?.error?.code ?? '-';
    const delay = backoffDelayMs(attempt);
    console.log(
      `${label} 失敗 (code=${code}): ${Math.round(delay / 1000)}秒後に再試行します (${attempt + 1}/${MAX_ATTEMPTS}回目)`,
    );
    await sleep(delay);
  }
}

async function waitForContainer(creationId, token, { tries = 20, intervalMs = 10000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const st = await apiCall('GET', `/${creationId}`, {
      fields: 'status_code,status',
      access_token: token,
    });
    const code = st.data?.status_code;
    if (code === 'FINISHED') return { ok: true };
    if (code === 'ERROR' || code === 'EXPIRED') {
      return { ok: false, reason: `コンテナ異常 (${code}): ${st.bodyText}` };
    }
    console.log(`コンテナ待機中 (${i + 1}/${tries}): status_code=${code ?? '取得不可'}`);
    await sleep(intervalMs);
  }
  return { ok: false, reason: 'コンテナがFINISHEDになりませんでした(タイムアウト)' };
}

async function postCarousel(post, igUserId, token) {
  const urls = imageUrls(post);

  // ① 画像ごとに item container を作成(一時障害はリトライ。2026-07-20の障害はここ)
  const children = [];
  for (const [i, url] of urls.entries()) {
    const item = await callWithRetry(
      () =>
        apiCall('POST', `/${igUserId}/media`, {
          image_url: url,
          is_carousel_item: 'true',
          access_token: token,
        }),
      `item container ${i + 1}枚目`,
    );
    if (!item.ok || !item.data?.id) {
      return { ok: false, step: `item-container(${i + 1}枚目)`, bodyText: item.bodyText, status: item.status };
    }
    children.push(item.data.id);
    console.log(`item container 作成 ${i + 1}/${urls.length}: ${item.data.id}`);
  }

  // ② カルーセルコンテナ作成(一時障害はリトライ)
  const carousel = await callWithRetry(
    () =>
      apiCall('POST', `/${igUserId}/media`, {
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption: buildCaption(post),
        access_token: token,
      }),
    'カルーセルコンテナ作成',
  );
  if (!carousel.ok || !carousel.data?.id) {
    return { ok: false, step: 'carousel-container', bodyText: carousel.bodyText, status: carousel.status };
  }
  const creationId = carousel.data.id;
  console.log(`カルーセルコンテナ作成: creation_id=${creationId}`);

  // ③ FINISHED になるまで待つ(Metaが各画像URLを取得し処理するのに時間がかかる)
  const waited = await waitForContainer(creationId, token);
  if (!waited.ok) return { ok: false, step: 'container-status', bodyText: waited.reason };

  // ④ publish(一時エラーはリトライ)
  const publish = await callWithRetry(
    () =>
      apiCall('POST', `/${igUserId}/media_publish`, {
        creation_id: creationId,
        access_token: token,
      }),
    'publish',
  );
  if (publish.ok && publish.data?.id) return { ok: true, postId: publish.data.id };
  return { ok: false, step: 'publish', bodyText: publish.bodyText, status: publish.status };
}

async function refreshToken(token) {
  // Instagramログイン方式の長期トークン(60日)は ig_refresh_token で延長する。
  // アプリシークレット不要。Threadsのリフレッシュと同じ仕組み。
  const res = await apiCall('GET', '/refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
  if (!res.ok || !res.data?.access_token) {
    console.error(`トークンリフレッシュ失敗: status=${res.status} body=${res.bodyText}`);
    process.exitCode = 1;
    return;
  }
  const days = res.data.expires_in ? Math.round(res.data.expires_in / 86400) : '(不明)';
  console.log(`トークンリフレッシュ成功 (有効期限 ≒ ${days}日)`);
  console.log(`NEW_TOKEN=${res.data.access_token}`);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const refreshOnly = process.env.REFRESH === '1';
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (refreshOnly) {
    if (!token) {
      console.error('IG_TOKEN が未設定です');
      process.exitCode = 1;
      return;
    }
    await refreshToken(token);
    return;
  }

  if (!dryRun && process.env.FORCE !== '1') {
    const dup = recentlyPostedFile();
    if (dup) {
      console.log(`直近${GUARD_HOURS}時間以内に投稿済みです(${dup})。スキップします。FORCE=1 で強制投稿できます。`);
      return;
    }
  }

  const files = loadQueueFiles();
  if (files.length === 0) {
    console.log('queueが空です。投稿するものがありません。');
    return;
  }
  const file = files[0];
  const post = JSON.parse(readFileSync(join(QUEUE_DIR, file), 'utf-8'));
  console.log(`投稿対象: ${file} (slug=${post.slug}, ${post.slides.length}枚, affiliate=${post.affiliate})`);
  console.log(`キャプション:\n---\n${buildCaption(post)}\n---`);

  const verified = await verifyImages(post, { checkRemote: !dryRun });
  if (!verified.ok) {
    console.error(`画像検証NG: ${verified.reason}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log(`[DRY_RUN] 画像URL:\n${imageUrls(post).map((u) => `  ${u}`).join('\n')}`);
    console.log('[DRY_RUN] ローカル画像OK。API呼び出しは行いません。');
    return;
  }

  if (!token || !igUserId) {
    console.error('シークレット未設定: IG_TOKEN / IG_USER_ID が必要です。');
    process.exitCode = 1;
    return;
  }

  // トークン・アカウントの疎通確認(Instagramログイン方式は /me で確認できる)
  const me = await apiCall('GET', '/me', { fields: 'user_id,username', access_token: token });
  if (!me.ok || !me.data?.username) {
    console.error(`アカウント確認失敗: status=${me.status} body=${me.bodyText}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Instagramアカウント確認: @${me.data.username} (user_id=${me.data.user_id})`);
  if (me.data.user_id && String(me.data.user_id) !== String(igUserId)) {
    console.warn(
      `⚠ IG_USER_ID(${igUserId}) と /me の user_id(${me.data.user_id}) が一致しません。` +
        ` /me の user_id を IG_USER_ID に設定してください。`,
    );
  }

  const result = await postCarousel(post, igUserId, token);
  if (!result.ok) {
    console.error(`投稿失敗 (step=${result.step}): status=${result.status ?? '-'} body=${result.bodyText}`);
    process.exitCode = 1;
    return;
  }
  console.log(`投稿成功: post_id=${result.postId}`);

  // queue → posted へ移動(投稿記録を追記)
  mkdirSync(POSTED_DIR, { recursive: true });
  const postedRecord = { ...post, posted_at: new Date().toISOString(), post_id: result.postId };
  writeFileSync(join(POSTED_DIR, file), JSON.stringify(postedRecord, null, 2) + '\n', 'utf-8');
  unlinkSync(join(QUEUE_DIR, file));
  console.log(`content/queue/${file} → content/posted/${file} に移動しました`);
}

main().catch((e) => {
  console.error(`予期しないエラー: ${e.stack ?? e.message}`);
  process.exitCode = 1;
});
