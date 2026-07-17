# furutoku — ふるとく研究室

主婦向け「ふるさと納税の比較・制度解説」Instagramアカウントの**全自動運用**リポジトリ。

- カルーセル画像を satori + resvg + sharp でテンプレート生成(ブラウザ不要)
- Instagram Graph API で毎日 12:00 JST に自動投稿(GitHub Actions)
- コンテンツは品質ゲート(公式ソース必須・NG表現検査・PR表記検査)を通過したものだけ投稿

| ファイル | 役割 |
|---|---|
| `content/queue/*.json` | 投稿待ちのカルーセル定義(ファイル名順に1日1件消化) |
| `content/posted/` | 投稿済みの記録(post_id付き) |
| `scripts/check-content.mjs` | 品質ゲート(`npm run check`) |
| `scripts/render.mjs` | JPEG生成 → `docs/posts/<slug>/`(`npm run render`) |
| `scripts/post-instagram.mjs` | カルーセル投稿(`npm run post`、DRY_RUN/REFRESH対応) |
| `PIPELINE.md` | コンテンツ生成エージェント向けの生成ルール |
| `SETUP.md` | 人間の一括セットアップ手順(アカウント/Meta/Secrets/ASP) |

画像は `docs/` 配下にコミットされ、raw.githubusercontent.com の公開URLとして Meta に渡される。

フォント: Noto Sans JP(SIL Open Font License 1.1、`assets/fonts/LICENSE-OFL.txt`)
