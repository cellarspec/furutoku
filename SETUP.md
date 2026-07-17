# SETUP.md — 人間がやる一括セットアップ手順

所要時間の目安: 45〜60分。完了すると毎日12:00 JSTに全自動投稿が始まる。
方式は **Instagram API with Instagram Login**(Facebookページ不要・トークン更新もアプリ内で完結)。

## 1. Instagramアカウント作成

1. Instagramアプリで新規アカウントを作成。名前候補(好みで選択):
   - **ふるとく研究室**(推奨。中立・データ検証のトーンでプロフィールと一貫)
   - ふるさと納税の教科書
   - かしこ納税
2. 「設定 → アカウントの種類とツール → プロアカウントに切り替える」で**ビジネス**(またはクリエイター)にする。**プロアカウント必須**(APIの前提)。
3. プロフィール文(例):
   > 【損しない返礼品えらび】主婦目線でふるさと納税を検証
   > ・還元率とコスパを比較 ・控除上限の目安も
   > ・すべて公式データ裏取り済み
   > 保存して寄付シーズンに見返してね👇

## 2. Metaアプリ設定(Instagramログイン方式 — Facebookページ不要)

[Meta for Developers](https://developers.facebook.com/) で作業(cellarspecのThreads設定と同じ開発者アカウントでよい)。この方式は **Facebookページを作らなくてよい**のが利点。

1. アプリに **Instagram** 製品(ユースケース「Instagram API」)を追加。左メニューで「**Instagramログインによる API設定**」を選ぶ(※「FacebookログインによるAPI設定」ではない)。
2. **役割(Roles)を割り当てる**: アプリの「役割」→ **Instagramテスター** に、投稿用Instagramアカウントのユーザー名を追加する。
   - その後、投稿用Instagramにログインして招待を承認する:
     Instagram「設定 → ウェブサイトの許可 / アプリとウェブサイト → テスターの招待」を承認(`https://www.instagram.com/accounts/manage_access/` からも可)。
   - ⚠ これを済ませないと次の「アカウントを追加」で **「開発者の役割が不十分です」** エラーになる。
3. 「2. アクセストークンを生成する」で **アカウントを追加** → 投稿用Instagramでログイン&権限許可。生成されたトークンが**短期トークン**。
   - 必要な権限: `instagram_business_basic`, `instagram_business_content_publish`。
4. **自分のアカウントに投稿するだけなら開発モードのままでよい見込み**(App Review不要)。トークン生成が通ればOK。通らない場合のみ公開審査を申請。

## 3. 長期トークンと IG_USER_ID の取得

`<APP_SECRET>` はアプリの「Instagram app secret」(手順2の画面の「表示」で確認)。`<短期トークン>` は手順2-3で生成したもの。

1. **短期 → 長期トークン(60日)** に交換(ブラウザのアドレスバーに貼って実行でよい):
   ```
   GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<APP_SECRET>&access_token=<短期トークン>
   ```
   返ってくる `access_token` が**長期トークン**。これを `IG_TOKEN` にする。
2. **IG_USER_ID の取得**:
   ```
   GET https://graph.instagram.com/me?fields=user_id,username&access_token=<長期トークン>
   ```
   返ってくる `user_id`(数字)が `IG_USER_ID`。
3. 長期トークンは60日で失効するが、ワークフローが毎週日曜に **`ig_refresh_token` で自動延長**する(アプリシークレット不要。ただしSecrets自動更新には `GH_PAT` が必要 — 手順4)。

## 4. GitHub Secrets 登録

リポジトリ `cellarspec/furutoku` の Settings → Secrets and variables → Actions:

| Secret | 値 | 必須 |
|---|---|---|
| `IG_TOKEN` | 手順3の長期トークン | ✅ |
| `IG_USER_ID` | 手順3の `user_id`(数字) | ✅ |
| `GH_PAT` | Secrets書き込み権限のFine-grained PAT(トークン自動更新用) | 推奨(無いと60日ごとに手動更新) |

登録後、Actionsタブから「Instagram」ワークフローを手動実行(workflow_dispatch)して動作確認。
初回投稿が成功したらセットアップ完了。以後毎日12:00 JSTに自動投稿される。

`GH_PAT` を作る場合: GitHub Settings → Developer settings → Fine-grained tokens で、リポジトリ `cellarspec/furutoku` に対し **Secrets: Read and write** 権限のトークンを発行して登録。無ければ60日ごとに手動でトークンを取り直して `IG_TOKEN` を更新する。

動作確認をローカルでやる場合:
```powershell
$env:DRY_RUN='1'; node scripts/post-instagram.mjs           # トークン不要の事前検証
$env:IG_TOKEN='...'; $env:IG_USER_ID='...'; node scripts/post-instagram.mjs  # 実投稿
```

## 5. ASP(アフィリエイト)登録 — 投稿が安定したら

**方針**: 審査不要・即時系から始め、金融系のような重い審査は不要。ふるさと納税は物販系の扱い。

1. **A8.net**(登録済み): メディアに本Instagramアカウントを追加登録 → 「さとふる」「ふるなび」プログラムに提携申請。
2. **楽天アフィリエイト(本家)**: https://affiliate.rakuten.co.jp/ で登録し「楽天ふるさと納税」のリンクを作る。
   ※もしも経由でなく**本家**を使う理由: 料率アップ対象商品の報酬上限(通常1商品1,000円)が本家では撤廃されるため有利。
3. **バリューコマース/アクセストレード**(任意): さとふる・ふるなびの単価を比較して有利な方を使う。
4. アフィリンクを貼る先(プロフィールリンクの飛び先)は後続フェーズのブログLP(下記)。**LP完成までは affiliate: false の教育投稿のみ**で運用し、プロフィールリンクは空でもよい。

## 6. 後続フェーズ(任意・収益化の本体)

- **ブログLP**: cellarspec方式(Astro + Cloudflare Pages 無料枠)で「還元率比較」「控除上限早見表」のLPを作り、プロフィールリンクに設定。アフィリンクはLP側に置く(Instagram本文にはリンクを貼れないため)。
- **コンテンツ生成routine**: claude.ai/code/routines で週3回、PIPELINE.md に従って queue に投稿JSONを積むroutineを作成する。
- フォロワーが伸びたら(目安3,000〜)、リール転用・PR案件も検討。

## 撤退ライン(2026-07時点の合意)

6ヶ月でフォロワー2,000未満かつ平均保存率3%未満、または初回年末商戦を含む12ヶ月で累計収益5,000円未満なら、次点テーマ(食材宅配比較)へピボット。

## 7. ブログサイト(site/)のセットアップ

`site/` に Astro製のブログLP(記事一覧・記事詳細・固定5ページ)を構築済み。`content/**/*.json` と `docs/posts/<slug>/*.jpg` から `npm run build`(内部で `scripts/prepare.mjs` が実行される)のたびに記事を自動生成するため、記事の追加・更新はこれまで通り `content/queue/` にJSONを積むだけでよい(site/側の手作業は不要)。

### 7-1. ローカル確認

```powershell
cd site
npm install
npm run build        # prepare.mjs → astro build。dist/ に静的サイトが生成される
npm run check-site    # 断定表現・ポイント訴求・PR表記の機械検証
npm run dev            # ローカルプレビュー(http://localhost:4321)
```

### 7-2. Cloudflare Pages 連携手順(人手)

1. [Cloudflare Pages](https://pages.cloudflare.com/) で「Connect to Git」→ GitHubリポジトリ `cellarspec/furutoku` を選択。
2. ビルド設定:
   - **Root directory**: `site`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **環境変数**: `NODE_VERSION` = `20`
3. デプロイ後、割り当てられる `*.pages.dev` のURLが `https://furutoku.pages.dev` になっているか確認する(異なる場合は `site/astro.config.mjs` の `site` を実際のURLに合わせて修正し、再デプロイ)。
4. 以後は `main` ブランチへのpushで自動デプロイされる(GitHub Actionsの追加は不要、Cloudflare Pages側のGit連携のみで完結)。

### 7-3. 楽天アフィリエイトURLの差し替え手順(登録後)

現在 `site/src/data/affiliate.json` の3ASP(楽天ふるさと納税/さとふる/ふるなび)は**すべて非アフィリエイトの通常リンク**(各公式トップページ)になっている。楽天アフィリエイト(またはA8.net等)の登録が完了したら:

1. `site/src/data/affiliate.json` の該当する `url` を発行されたアフィリエイトリンクに差し替える(`affiliate: false` は `true` に変更)。
2. コミット・pushすると、全記事末尾の「返礼品を探す」ボタン(`AffiliateCta.astro`)に自動反映される。記事側のJSON(`content/**/*.json`)やコンポーネントの修正は不要。
3. さとふる・ふるなびはA8.net経由のリンクに差し替える想定(SETUP.md §5参照)。

### 7-4. Googleフォーム(お問い合わせ)の差し替え手順

`site/src/pages/contact.astro` のリンクは現在プレースホルダ `https://forms.gle/PLACEHOLDER`(HTMLコメントで明示済み)になっている。Googleフォームを作成したら、同ファイル内の該当URLを実際のフォームURLに差し替えてコミットする。

### 7-5. 審査申請の前提とドメイン戦略

- 各ASP(A8.net経由のさとふる・ふるなび等)やGoogle AdSense等の審査を申請する場合、**記事本数は最低8本以上**を目安に用意してから申請する(現状は4本。`content/queue/` を通常運用で消化していけば到達する)。
- ドメインは段階戦略: まず無料の `furutoku.pages.dev` で審査申請し、通れば当面はそのまま運用する。審査が `pages.dev` ドメインを理由に落ちた場合のみ、独自ドメインを取得して `astro.config.mjs` の `site` とCloudflare PagesのCustom domainsを切り替える(現時点では独自ドメインの取得・設定は行わない)。
