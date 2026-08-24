import assert from "node:assert/strict";
import test from "node:test";
import {
  actualH3CostJpy,
  estimateH3CostJpy,
  MINIMAX_H3_PRICING,
  USD_TO_JPY_RATE,
} from "./model-pricing";
import { estimateGenerationCostJpy, actualGenerationCostJpy } from "./cost";

const jpy = (usd: number) => Math.ceil(usd * USD_TO_JPY_RATE);

test("768P / 5秒 / 参照なし", () => {
  assert.equal(
    estimateH3CostJpy({
      resolution: "768P",
      durationSeconds: 5,
      referenceImageCount: 0,
      hasReferenceVideo: false,
    }),
    jpy(0.08 * 5)
  );
});

test("2K / 15秒(上限) / 参照なし", () => {
  assert.equal(
    estimateH3CostJpy({
      resolution: "2K",
      durationSeconds: 15,
      referenceImageCount: 0,
      hasReferenceVideo: false,
    }),
    jpy(0.13 * 15)
  );
});

test("参照画像は先頭5枚まで無料、6枚目以降が従量", () => {
  const base = estimateH3CostJpy({
    resolution: "2K",
    durationSeconds: 10,
    referenceImageCount: 0,
    hasReferenceVideo: false,
  });
  const five = estimateH3CostJpy({
    resolution: "2K",
    durationSeconds: 10,
    referenceImageCount: 5,
    hasReferenceVideo: false,
  });
  assert.equal(five, base, "5枚までは無料");

  const seven = estimateH3CostJpy({
    resolution: "2K",
    durationSeconds: 10,
    referenceImageCount: 7,
    hasReferenceVideo: false,
  });
  assert.equal(seven, jpy(0.13 * 10 + 2 * 0.04));
  // 2K/10秒/画像7枚 = $1.38 -> ¥220
  assert.equal(seven, 220);
});

test("参照動画があるときはAPI上限の15秒ぶんを満額で仮押さえする", () => {
  const withVideo = estimateH3CostJpy({
    resolution: "768P",
    durationSeconds: 5,
    referenceImageCount: 0,
    hasReferenceVideo: true,
  });
  assert.equal(withVideo, jpy(0.08 * 5 + 0.08 * MINIMAX_H3_PRICING.maxInputVideoSeconds));
});

test("確定額は報告された実使用量から算出する", () => {
  assert.equal(
    actualH3CostJpy("2K", { outputSeconds: 10, inputSeconds: 4, inputImageCount: 7 }),
    jpy(0.13 * 10 + 0.13 * 4 + 2 * 0.04)
  );
});

test("使用量が信用できない場合は null を返し、仮押さえ額のまま確定させる", () => {
  assert.equal(actualH3CostJpy("2K", undefined), null);
  assert.equal(actualH3CostJpy("2K", {}), null);
  assert.equal(actualH3CostJpy("2K", { outputSeconds: 0 }), null);
  assert.equal(actualH3CostJpy("2K", { outputSeconds: -5 }), null);
  assert.equal(actualH3CostJpy("2K", { outputSeconds: Number.NaN }), null);
  assert.equal(actualH3CostJpy("unknown-resolution", { outputSeconds: 5 }), null);
});

test("不正な入力秒・画像枚数は0として扱い、出力ぶんだけ課金する", () => {
  assert.equal(
    actualH3CostJpy("768P", {
      outputSeconds: 5,
      inputSeconds: Number.NaN,
      inputImageCount: -3,
    }),
    jpy(0.08 * 5)
  );
});

test("ディスパッチャはモデルごとに正しい式を選ぶ", () => {
  const h3 = estimateGenerationCostJpy({
    model: "minimax-h3",
    resolution: "768P",
    durationSeconds: 5,
    hasVideoInput: false,
    referenceImageCount: 0,
  });
  assert.equal(h3, jpy(0.08 * 5));

  // Seedance はトークン式なので H3 の単価とは一致しない(既存の式が使われていること)
  const seedance = estimateGenerationCostJpy({
    model: "seedance-2.5",
    resolution: "720p",
    durationSeconds: 5,
    hasVideoInput: false,
  });
  assert.ok(seedance > 0);
  assert.notEqual(seedance, h3);

  assert.equal(
    actualGenerationCostJpy({
      model: "minimax-h3",
      resolution: "768P",
      hasVideoInput: false,
      usage: { outputSeconds: 5 },
    }),
    jpy(0.08 * 5)
  );
  // Seedance 側はトークンを見る。H3形式の usage しか無い場合は確定できない
  assert.equal(
    actualGenerationCostJpy({
      model: "seedance-2.5",
      resolution: "720p",
      hasVideoInput: false,
      usage: { outputSeconds: 5 },
    }),
    null
  );
});
