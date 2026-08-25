import assert from "node:assert/strict";
import test from "node:test";
import {
  creditAdjustmentSchema,
  creditTransactionLabel,
  revokeNote,
  MAX_ADJUSTMENT_AMOUNT,
} from "./adjustment";

test("正の金額(付与)を受け付ける", () => {
  const parsed = creditAdjustmentSchema.parse({ amount: 1000, note: "月次補充" });
  assert.equal(parsed.amount, 1000);
  assert.equal(parsed.note, "月次補充");
});

test("負の金額(剥奪)を受け付ける", () => {
  assert.equal(creditAdjustmentSchema.parse({ amount: -1000 }).amount, -1000);
});

test("0は弾く", () => {
  const result = creditAdjustmentSchema.safeParse({ amount: 0 });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /0は指定できません/);
});

test("小数は弾く", () => {
  assert.equal(creditAdjustmentSchema.safeParse({ amount: 100.5 }).success, false);
});

test("上限・下限の境界を受け付け、それを超えたら弾く", () => {
  assert.equal(creditAdjustmentSchema.safeParse({ amount: MAX_ADJUSTMENT_AMOUNT }).success, true);
  assert.equal(creditAdjustmentSchema.safeParse({ amount: -MAX_ADJUSTMENT_AMOUNT }).success, true);
  assert.equal(
    creditAdjustmentSchema.safeParse({ amount: MAX_ADJUSTMENT_AMOUNT + 1 }).success,
    false
  );
  assert.equal(
    creditAdjustmentSchema.safeParse({ amount: -MAX_ADJUSTMENT_AMOUNT - 1 }).success,
    false
  );
});

test("500文字を超えるメモは弾く", () => {
  assert.equal(creditAdjustmentSchema.safeParse({ amount: 1, note: "あ".repeat(500) }).success, true);
  assert.equal(
    creditAdjustmentSchema.safeParse({ amount: 1, note: "あ".repeat(501) }).success,
    false
  );
});

test("剥奪メモには剥奪である旨が入る", () => {
  assert.equal(revokeNote("誤付与の取り消し"), "剥奪: 誤付与の取り消し");
  assert.equal(revokeNote(), "剥奪");
  assert.equal(revokeNote("   "), "剥奪");
});

test("種別ラベルは GRANT の符号で付与と剥奪を分ける", () => {
  assert.equal(creditTransactionLabel({ type: "GRANT", amount: 1000 }), "付与");
  assert.equal(creditTransactionLabel({ type: "GRANT", amount: -1000 }), "剥奪");
  assert.equal(creditTransactionLabel({ type: "CONSUMPTION", amount: -300 }), "消費");
  assert.equal(creditTransactionLabel({ type: "REFUND", amount: 300 }), "返還");
});

test("未知の種別が来ても落ちない", () => {
  assert.equal(creditTransactionLabel({ type: "SOMETHING_NEW", amount: 1 }), "SOMETHING_NEW");
});
