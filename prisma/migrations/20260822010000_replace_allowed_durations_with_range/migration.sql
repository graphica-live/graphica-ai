-- 動画長の選択を1秒刻みのスライダーにするため、離散の許可リスト(allowedDurations)を
-- 下限・上限の範囲(minDurationSeconds / maxDurationSeconds)へ置き換える。

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "minDurationSeconds" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "maxDurationSeconds" INTEGER NOT NULL DEFAULT 5;

-- 既存の許可リストの最小値・最大値を範囲へ移送する。
-- Seedance 2.5 の duration は 4〜30 のため、範囲外の値(旧UIには存在しないが手動投入されうる)は
-- clamp する。許可リストが空だった場合は既定の5秒固定とする。
UPDATE "User" SET
  "minDurationSeconds" = GREATEST(4, LEAST(30, COALESCE((SELECT MIN(d) FROM unnest("allowedDurations") AS d), 5))),
  "maxDurationSeconds" = GREATEST(4, LEAST(30, COALESCE((SELECT MAX(d) FROM unnest("allowedDurations") AS d), 5)));

-- DropColumn
ALTER TABLE "User" DROP COLUMN "allowedDurations";

-- 範囲としての不変条件をDBレベルでも保証する(アプリ側のzod検証と二重化)。
ALTER TABLE "User"
  ADD CONSTRAINT "User_durationSeconds_range_check"
  CHECK ("minDurationSeconds" >= 4 AND "maxDurationSeconds" <= 30 AND "minDurationSeconds" <= "maxDurationSeconds");
