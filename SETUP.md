# SETUP.md — 人間がやる一括セットアップ手順

所要時間の目安: 60〜90分(Metaアプリ設定含む)。完了すると毎日12:00 JSTに全自動投稿が始まる。

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

## 2. Facebookページ作成と紐付け

Instagram Graph API(投稿API)は**Facebookページに紐付いたプロアカウント**が前提。

1. Facebookで新規ページを作成(名前はアカウント名と同じでよい。公開範囲は最小限でOK、投稿は不要)。
2. Instagramアプリの「設定 → ビジネスツールと管理 → Facebookページをリンク」で作成したページを紐付け。

## 3. Metaアプリ設定

[Meta for Developers](https://developers.facebook.com/) で作業(cellarspecのThreads設定と同じ開発者アカウントでよい)。

1. 既存アプリ「cellarspec」に **Instagram Graph API** 製品を追加する(新規アプリでも可。その場合タイプは「ビジネス」)。
2. アプリに **Facebookログイン(ビジネス)** も追加されていることを確認。
3. **自分のアカウントに投稿するだけなら開発モードのままでよい見込み**: アプリの管理者(自分)が管理するページ/Instagramには、App Review(公開審査、2〜4週間)なしで開発モードのままAPIを使える。※Meta側の仕様変更がありうるため、トークン取得(手順4)が通るかで判断。通らない場合のみApp Reviewを申請(`instagram_business_basic` と `instagram_business_content_publish`)。

## 4. トークンと IG_USER_ID の取得

[Graph API Explorer](https://developers.facebook.com/tools/explorer/) を使う。

1. 対象アプリを選択 → 「User Token」で以下の権限を付けて「Generate Access Token」:
   `pages_show_list`, `business_management`, `instagram_basic`(表示名は `instagram_business_basic`), `instagram_content_publish`(表示名は `instagram_business_content_publish`)
2. 短期トークンを**長期トークン(約60日)**に交換:
   ```
   GET https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<短期トークン>
   ```
3. **無期限ページトークンの取得(推奨)** — 長期ユーザートークンで:
   ```
   GET https://graph.facebook.com/v23.0/me/accounts?access_token=<長期ユーザートークン>
   ```
   返ってくる `data[].access_token` がページトークン。**長期ユーザートークン経由で取得したページトークンは失効しない**ため、60日ごとの更新が不要になる。これを `IG_TOKEN` にする。
4. **IG_USER_ID の取得**:
   ```
   GET https://graph.facebook.com/v23.0/me/accounts?fields=instagram_business_account,name&access_token=<長期ユーザートークン>
   ```
   `instagram_business_account.id`(数字)が `IG_USER_ID`。

## 5. GitHub Secrets 登録

リポジトリ `cellarspec/furutoku` の Settings → Secrets and variables → Actions:

| Secret | 値 | 必須 |
|---|---|---|
| `IG_TOKEN` | 手順4のトークン(ページトークン推奨) | ✅ |
| `IG_USER_ID` | InstagramビジネスアカウントID(数字) | ✅ |
| `FB_APP_ID` / `FB_APP_SECRET` | 長期**ユーザー**トークン運用時の自動リフレッシュ用 | ページトークンなら不要 |
| `GH_PAT` | Secrets書き込み権限のFine-grained PAT(トークン自動更新用) | 同上 |

登録後、Actionsタブから「Instagram」ワークフローを手動実行(workflow_dispatch)して動作確認。
初回投稿が成功したらセットアップ完了。以後毎日12:00 JSTに自動投稿される。

動作確認をローカルでやる場合:
```powershell
$env:DRY_RUN='1'; node scripts/post-instagram.mjs           # トークン不要の事前検証
$env:IG_TOKEN='...'; $env:IG_USER_ID='...'; node scripts/post-instagram.mjs  # 実投稿
```

## 6. ASP(アフィリエイト)登録 — 投稿が安定したら

**方針**: 審査不要・即時系から始め、金融系のような重い審査は不要。ふるさと納税は物販系の扱い。

1. **A8.net**(登録済み): メディアに本Instagramアカウントを追加登録 → 「さとふる」「ふるなび」プログラムに提携申請。
2. **楽天アフィリエイト(本家)**: https://affiliate.rakuten.co.jp/ で登録し「楽天ふるさと納税」のリンクを作る。
   ※もしも経由でなく**本家**を使う理由: 料率アップ対象商品の報酬上限(通常1商品1,000円)が本家では撤廃されるため有利。
3. **バリューコマース/アクセストレード**(任意): さとふる・ふるなびの単価を比較して有利な方を使う。
4. アフィリンクを貼る先(プロフィールリンクの飛び先)は後続フェーズのブログLP(下記)。**LP完成までは affiliate: false の教育投稿のみ**で運用し、プロフィールリンクは空でもよい。

## 7. 後続フェーズ(任意・収益化の本体)

- **ブログLP**: cellarspec方式(Astro + Cloudflare Pages 無料枠)で「還元率比較」「控除上限早見表」のLPを作り、プロフィールリンクに設定。アフィリンクはLP側に置く(Instagram本文にはリンクを貼れないため)。
- **コンテンツ生成routine**: claude.ai/code/routines で週3回、PIPELINE.md に従って queue に投稿JSONを積むroutineを作成する。
- フォロワーが伸びたら(目安3,000〜)、リール転用・PR案件も検討。

## 撤退ライン(2026-07時点の合意)

6ヶ月でフォロワー2,000未満かつ平均保存率3%未満、または初回年末商戦を含む12ヶ月で累計収益5,000円未満なら、次点テーマ(食材宅配比較)へピボット。
