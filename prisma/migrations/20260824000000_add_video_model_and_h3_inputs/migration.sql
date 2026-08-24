-- MiniMax H3 を第2の動画生成モデルとして追加するための expand-only マイグレーション。
--
-- DROP・型変更・既存 default の変更は行わない。Railway は単一サービスのローリング
-- デプロイで、このマイグレーションは旧コードが動いている最中に適用される。
-- 詳細は CLAUDE.md の「DB Migration Rule（expand / contract）」を参照。

-- どのモデルで生成したか。旧コードは Seedance しか作らないので、ローリング中に
-- 旧コンテナが作る行も default が正しい値になる。
ALTER TABLE "GenerationJob" ADD COLUMN "model" TEXT NOT NULL DEFAULT 'seedance-2.5';

-- 生成モードには NOT NULL / DEFAULT を付けない。
-- DB default を置くと、ローリング中に旧コード（generationMode を書かない版）が作る
-- image ジョブに 'reference' が入り、新コードが誤分類する。NULL の行は
-- firstFrameImageKey から導出する（src/lib/generation/generation-mode.ts）。
ALTER TABLE "GenerationJob" ADD COLUMN "generationMode" TEXT;

ALTER TABLE "GenerationJob" ADD COLUMN "referenceAudioKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GenerationJob" ADD COLUMN "providerErrorCode" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "providerUsage" JSONB;

-- このマイグレーション時点で既に存在する行は「旧コードだけが作った行」なので、
-- 実データから生成モードを確定できる。
UPDATE "GenerationJob"
   SET "generationMode" = CASE
         WHEN "firstFrameImageKey" IS NOT NULL THEN 'image'
         ELSE 'reference'
       END
 WHERE "generationMode" IS NULL;

-- 利用できるモデル。既存スタッフは両モデル許可で移行する。
-- allowedResolutions / allowedGenerationModes には H3 の値を混ぜない
-- （旧管理画面フォームが配列を全置換するため、追記しても古いタブからの保存で消える）。
ALTER TABLE "User" ADD COLUMN "allowedModels" TEXT[] NOT NULL
  DEFAULT ARRAY['seedance-2.5', 'minimax-h3']::TEXT[];
