import assert from "node:assert/strict";
import test from "node:test";
import { getModelSpec, providerOf, VIDEO_MODELS, isVideoModelId } from "./models";
import { GENERATION_MODES } from "./options";
import { resolveGenerationMode } from "./generation-mode";

test("Seedance のモードに H3 専用モードが混入しない(回帰防止)", () => {
  // GENERATION_MODES は全モデルの集合。UIやAPIがこれをそのまま使うと
  // Seedance フォームに text / firstlast が出て壊れる。
  const seedance = getModelSpec("seedance-2.5");
  assert.deepEqual([...seedance.modes], ["reference", "image"]);
  assert.ok(!seedance.modes.includes("text"));
  assert.ok(!seedance.modes.includes("firstlast"));
});

test("各モデルのモードは GENERATION_MODES の部分集合である", () => {
  for (const id of VIDEO_MODELS) {
    for (const mode of getModelSpec(id).modes) {
      assert.ok(
        (GENERATION_MODES as readonly string[]).includes(mode),
        `${id} の ${mode} が GENERATION_MODES にない`
      );
    }
  }
});

test("H3 の既定値は 768P / 画像から動画 / 1本生成", () => {
  const h3 = getModelSpec("minimax-h3");
  assert.equal(h3.defaultResolution, "768P");
  assert.equal(h3.defaultMode, "image");
  assert.equal(h3.maxBatchSize, 1);
  assert.equal(h3.requiresPrompt, true);
  assert.equal(h3.supportsAudioToggle, false);
  assert.equal(h3.durationMin, 4);
  assert.equal(h3.durationMax, 15);
  assert.equal(h3.limits.maxReferenceImages, 9);
  assert.equal(h3.limits.maxReferenceVideos, 3);
  assert.equal(h3.limits.maxReferenceAudios, 3);
  assert.equal(h3.limits.maxTotalReferenceFiles, 12);
});

test("provider の対応付け", () => {
  assert.equal(providerOf("seedance-2.5"), "dreamina");
  assert.equal(providerOf("minimax-h3"), "minimax");
});

test("isVideoModelId は未知の値を弾く", () => {
  assert.ok(isVideoModelId("minimax-h3"));
  assert.ok(isVideoModelId("seedance-2.5"));
  assert.ok(!isVideoModelId("kling"));
  assert.ok(!isVideoModelId(undefined));
});

test("generationMode が NULL の古いジョブは実データから導出する", () => {
  assert.equal(
    resolveGenerationMode({ generationMode: null, firstFrameImageKey: "uploads/u/a.jpg" }),
    "image"
  );
  assert.equal(resolveGenerationMode({ generationMode: null, firstFrameImageKey: null }), "reference");
  // 保存済みの値がある場合はそちらを優先する
  assert.equal(
    resolveGenerationMode({ generationMode: "firstlast", firstFrameImageKey: "uploads/u/a.jpg" }),
    "firstlast"
  );
  // 未知の値はDB由来でも信用しない
  assert.equal(resolveGenerationMode({ generationMode: "bogus", firstFrameImageKey: null }), "reference");
});
