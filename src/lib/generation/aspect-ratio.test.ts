import assert from "node:assert/strict";
import test from "node:test";
import { cssAspectRatio } from "./aspect-ratio";
import { ASPECT_RATIOS, ADAPTIVE_ASPECT_RATIO } from "./options";

test("縦動画の 9:16 が CSS の比率へ変換される", () => {
  // 16:9 固定枠で表示していたため 9:16 の生成物が切り取られていた。
  // 表示枠がジョブの比率に追従することを保証する。
  assert.equal(cssAspectRatio("9:16"), "9 / 16");
});

test("選択可能なアスペクト比はすべて変換できる", () => {
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(":");
    assert.equal(cssAspectRatio(ratio), `${w} / ${h}`);
  }
});

test("H3 が返しうる 21:9 / 3:4 も変換できる", () => {
  // ASPECT_RATIOS に無い比率でも、プロバイダ側の adaptive 解決やモデル拡張で
  // ジョブに入りうる。表示側は選択肢の一覧に依存せず解釈する。
  assert.equal(cssAspectRatio("21:9"), "21 / 9");
  assert.equal(cssAspectRatio("3:4"), "3 / 4");
});

test("adaptive は既定枠へフォールバックさせるため undefined を返す", () => {
  // image / firstlast モードでは実際の比率が再生するまで分からない。
  assert.equal(cssAspectRatio(ADAPTIVE_ASPECT_RATIO), undefined);
});

test("未設定・不正な値は undefined を返す", () => {
  assert.equal(cssAspectRatio(undefined), undefined);
  assert.equal(cssAspectRatio(null), undefined);
  assert.equal(cssAspectRatio(""), undefined);
  assert.equal(cssAspectRatio("16-9"), undefined);
  assert.equal(cssAspectRatio("16:9:1"), undefined);
  assert.equal(cssAspectRatio("0:9"), undefined);
  assert.equal(cssAspectRatio("16:0"), undefined);
});
