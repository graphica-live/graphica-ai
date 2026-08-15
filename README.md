# Graphica AI Video

社内向けAI動画生成サービス。dreaminaAPIを使って動画を生成し、Railway上でホスティングする。
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
3. マイグレーションとシードを実行
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   シードにより`ADMIN_EMAIL`で指定したメールアドレスが管理者として登録され、初期単価テーブル(`PricingRule`)が投入される。
4. 開発サーバーを起動
   ```bash
   npm run dev
   ```

## 認証の仕組み

- 管理者(`ADMIN_EMAIL`で指定したメールアドレス)は初回Googleログイン時に自動的に`ADMIN`ロールが付与される。
- スタッフは管理画面(`/admin`)からメールアドレスで事前登録する必要がある。登録したメールアドレスと
  同一のメールアドレスでGoogleログインすると、既存アカウントに自動的に紐付いてログインできる。
  未登録のメールアドレスではログインできない。

## Dreamina API接続

`src/lib/video-provider/`にプロバイダー抽象化層がある。実仕様が確定するまでは
`DREAMINA_MOCK_MODE=1`でMockプロバイダ(`mock-provider.ts`)を使う。実API接続時は
`dreamina-provider.ts`のsubmit/getStatusを実装し、`DREAMINA_MOCK_MODE=0`にする。

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
- `npm run db:migrate` — Prismaマイグレーション(開発用)
- `npm run db:seed` — 管理者アカウント・初期単価テーブルの投入
- `npm run db:studio` — Prisma Studio(DBブラウザ)
