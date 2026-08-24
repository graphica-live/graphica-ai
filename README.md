# Graphica AI Video

社内向けAI動画生成サービス。Seedance 2.5(dreamina API)と MiniMax H3 の2モデルで動画を生成し、
Railway上でホスティングする。
生成済み動画はRailway Object Storage(S3互換)に保存し、常にpresigned URL経由でクライアントが
直接アクセスする(アプリサーバーを動画バイト列が経由しないためegress料金を避けられる)。

## セットアップ(ローカル開発)

1. 依存関係のインストール
   ```bash
   npm install
   ```
2. `.env`を編集し、以下を設定する
   - `DATABASE_URL`: ローカルまたは開発用PostgreSQLの接続文字列
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google Cloud Consoleで発行したOAuthクライアント
   - `NEXTAUTH_SECRET`: `openssl rand -base64 32`等で生成
   - `S3_*`: Railway Object Storageの接続情報(未設定でも`DREAMINA_MOCK_MODE=1`のままなら生成フロー自体は動作確認できるが、bucket保存はエラーになるため実際の動作確認にはS3互換ストレージの用意が必要)
   - `DREAMINA_MOCK_MODE=1`のままにしておくと、Dreamina API未接続でもMockプロバイダで生成〜履歴表示までの全フローを確認できる
   - `MINIMAX_MOCK_MODE=1`のままにしておくと、MiniMax API未接続でもH3の4モードを一通り確認できる(本番では効かない。下記「MiniMax H3 の有効化手順」参照)
3. マイグレーションとシードを実行
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   シードにより`ADMIN_EMAIL`で指定したメールアドレスが管理者として登録される。クレジット消費額はAPI使用料原価(`src/lib/credits/cost.ts`)から算出するため、単価テーブルの投入は不要。
4. 開発サーバーを起動
   ```bash
   npm run dev
   ```

## 認証の仕組み

- 管理者(`ADMIN_EMAIL`で指定したメールアドレス)は初回Googleログイン時に自動的に`ADMIN`ロールが付与される。
- スタッフは管理画面(`/admin`)からメールアドレスで事前登録する必要がある。登録したメールアドレスと
  同一のメールアドレスでGoogleログインすると、既存アカウントに自動的に紐付いてログインできる。
  未登録のメールアドレスではログインできない。

## 動画生成モデルとプロバイダー

`src/lib/generation/models.ts` にモデル定義(対応モード・解像度・上限・料金要因)を集約し、
`src/lib/video-provider/` に各社APIのアダプタを置いている。UI・生成APIのバリデーション・課金・
プロバイダ選択はすべて `models.ts` を唯一の真実として参照する。

| モデル | provider | モード | 解像度 | 長さ |
|---|---|---|---|---|
| Seedance 2.5 | `dreamina` | テキスト・参照 / 画像から生成 | 480p / 720p / 1080p | 4〜30秒 |
| MiniMax H3 | `minimax` | 画像から動画 / テキスト / 始点・終点 / 参照素材 | 768P / 2K | 4〜15秒 |

スタッフごとの利用可否は `User.allowedModels` で制御する(管理画面の「生成設定の制限」)。
解像度と生成モードの許可リストは Seedance 2.5 専用の設定で、H3 には適用されない。
動画長の範囲(`minDurationSeconds` / `maxDurationSeconds`)は両モデルに適用される。

### Dreamina API接続

実仕様が確定するまでは `DREAMINA_MOCK_MODE=1` でMockプロバイダを使う。実API接続時は
`dreamina-provider.ts` のモデルIDを確認し、`DREAMINA_MOCK_MODE=0` にする。

### MiniMax H3 の有効化手順

**この順序を守ること。** ポーラーはジョブを `provider` で絞って処理するが、この仕組みが
入る前のコンテナはすべてのジョブをDreamina APIへ問い合わせてしまう。ローリングデプロイ中に
旧コンテナがH3ジョブを拾うと、MiniMax側では生成と課金が続いているのに失敗・返金され、
二重に損をする。

1. `MINIMAX_API_KEY` を**設定しないまま**アプリをデプロイする
   → キーが無い間はH3が利用不可として扱われ、H3ジョブが1件も作られない
2. Railwayでデプロイ完了(全コンテナの入れ替え)を確認する
3. Railway Variables に `MINIMAX_API_KEY` を設定する
   → 再起動で入れ替わる新旧どちらのコンテナも `provider` フィルタ入りなので安全
4. ロールバックする場合は、先に `MINIMAX_API_KEY` を削除して新規受付を止め、
   処理中のH3ジョブが終わってから戻す

## デプロイ(Railway)

`railway.toml`でDockerfileビルドを指定済み。Railway上で以下のサービスを用意する:

- Postgres(`DATABASE_URL`として接続)
- Object Storage(S3互換。`S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_BUCKET_NAME`)
- 本アプリ(Dockerfileビルド。起動時に`prisma migrate deploy`を実行してからNext.jsサーバーを起動する)

初回デプロイ後、Railway上のシェルまたはワンオフジョブで`npm run db:seed`を実行して管理者アカウントを
投入する。

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run build` / `npm run start` — 本番ビルド/起動
- `npm run lint` — ESLint
- `npm test` — ユニットテスト(Node標準の `node:test` + `tsx`。`src/**/*.test.ts`)
- `npm run db:migrate` — Prismaマイグレーション(開発用)
- `npm run db:seed` — 管理者アカウントの投入
- `npm run db:studio` — Prisma Studio(DBブラウザ)
