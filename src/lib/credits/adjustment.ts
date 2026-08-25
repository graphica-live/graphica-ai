import { z } from "zod";

// 管理者によるクレジット調整(付与・剥奪)の共通ルール。
//
// 剥奪は取引種別を分けず、type は GRANT のまま amount を負で記録する。
// CreditTxType へ REVOKE を足すと、ローリングデプロイ中に旧コンテナの
// Prisma Client が未知のenum値を読めず履歴取得が500になるため
// (Prisma 5 は生成時に知らないenum値をデシリアライズできない)。
// 「付与」と「剥奪」は amount の符号で判別し、メモにも剥奪である旨を残す。

/** 1回の操作で動かせる金額の上限(円)。桁の打ち間違いをここで止める。 */
export const MAX_ADJUSTMENT_AMOUNT = 10_000_000;

export const creditAdjustmentSchema = z.object({
  amount: z
    .number()
    .int("金額は整数で指定してください")
    .min(-MAX_ADJUSTMENT_AMOUNT, `剥奪額は${MAX_ADJUSTMENT_AMOUNT.toLocaleString()}円までです`)
    .max(MAX_ADJUSTMENT_AMOUNT, `付与額は${MAX_ADJUSTMENT_AMOUNT.toLocaleString()}円までです`)
    .refine((v) => v !== 0, "金額に0は指定できません"),
  note: z.string().max(500, "メモは500文字までです").optional(),
});

export type CreditAdjustment = z.infer<typeof creditAdjustmentSchema>;

/**
 * 剥奪取引のメモ。
 * 種別が GRANT のままでも履歴から剥奪と分かるよう、メモの先頭に明示する。
 */
export function revokeNote(note?: string): string {
  const trimmed = note?.trim();
  return trimmed ? `剥奪: ${trimmed}` : "剥奪";
}

/**
 * 履歴に表示する取引種別のラベル。
 * 剥奪は GRANT の負値として記録されるため、種別だけでなく符号も見る。
 */
export function creditTransactionLabel(tx: { type: string; amount: number }): string {
  switch (tx.type) {
    case "GRANT":
      return tx.amount < 0 ? "剥奪" : "付与";
    case "CONSUMPTION":
      return "消費";
    case "REFUND":
      return "返還";
    default:
      // 将来種別が増えても表が壊れないよう、未知の値はそのまま出す
      return tx.type;
  }
}
