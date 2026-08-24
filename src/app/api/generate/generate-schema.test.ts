import assert from "node:assert/strict";
import test from "node:test";
import { generateRequestSchema } from "./generate-schema";

const h3Base = {
  model: "minimax-h3",
  prompt: "海辺を走る犬",
  resolution: "768P",
  durationSeconds: 5,
};

function parse(body: unknown) {
  return generateRequestSchema.safeParse(body);
}

test("model 未指定は Seedance として扱う(ローリング中の旧クライアント互換)", () => {
  const result = parse({
    prompt: "テスト",
    resolution: "720p",
    durationSeconds: 5,
    aspectRatio: "16:9",
  });
  assert.ok(result.success);
  assert.equal(result.data.model, "seedance-2.5");
  assert.equal(result.data.mode, "reference");
});

test("Seedance に H3 専用モードは渡せない", () => {
  for (const mode of ["text", "firstlast"]) {
    const result = parse({
      model: "seedance-2.5",
      mode,
      prompt: "テスト",
      resolution: "720p",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });
    assert.equal(result.success, false, `mode=${mode}`);
  }
});

test("Seedance の既存リクエスト形はそのまま通る", () => {
  const reference = parse({
    model: "seedance-2.5",
    mode: "reference",
    prompt: "テスト",
    referenceImageKeys: ["uploads/u1/a.jpg"],
    resolution: "1080p",
    durationSeconds: 8,
    aspectRatio: "9:16",
    batchSize: 10,
  });
  assert.ok(reference.success);

  const image = parse({
    model: "seedance-2.5",
    mode: "image",
    prompt: "",
    firstFrameImageKey: "uploads/u1/a.jpg",
    resolution: "720p",
    durationSeconds: 5,
  });
  assert.ok(image.success, "Seedance の image モードはプロンプト任意");
});

test("H3: 全モードで非空プロンプトが必須", () => {
  for (const mode of ["image", "text", "firstlast", "reference"]) {
    const result = parse({
      ...h3Base,
      mode,
      prompt: "   ",
      firstFrameImageKey: "uploads/u1/a.jpg",
      endFrameImageKey: "uploads/u1/b.jpg",
      aspectRatio: "16:9",
      referenceImageKeys: mode === "reference" ? ["uploads/u1/r.jpg"] : [],
    });
    assert.equal(result.success, false, `mode=${mode} で空プロンプトが通ってしまった`);
  }
});

test("H3 image: 開始画像必須・終了画像禁止・参照素材禁止", () => {
  assert.ok(parse({ ...h3Base, mode: "image", firstFrameImageKey: "uploads/u1/a.jpg" }).success);

  assert.equal(parse({ ...h3Base, mode: "image" }).success, false, "開始画像なし");
  assert.equal(
    parse({
      ...h3Base,
      mode: "image",
      firstFrameImageKey: "uploads/u1/a.jpg",
      endFrameImageKey: "uploads/u1/b.jpg",
    }).success,
    false,
    "終了画像は始点・終点モード専用"
  );
  assert.equal(
    parse({
      ...h3Base,
      mode: "image",
      firstFrameImageKey: "uploads/u1/a.jpg",
      referenceImageKeys: ["uploads/u1/r.jpg"],
    }).success,
    false,
    "フレーム方式と参照方式は併用不可"
  );
});

test("H3 firstlast: 開始画像と終了画像の両方が必須", () => {
  assert.ok(
    parse({
      ...h3Base,
      mode: "firstlast",
      firstFrameImageKey: "uploads/u1/a.jpg",
      endFrameImageKey: "uploads/u1/b.jpg",
    }).success
  );
  assert.equal(
    parse({ ...h3Base, mode: "firstlast", firstFrameImageKey: "uploads/u1/a.jpg" }).success,
    false
  );
});

test("H3 text: 素材を受け付けず、アスペクト比が必須", () => {
  assert.ok(parse({ ...h3Base, mode: "text", aspectRatio: "16:9" }).success);
  assert.equal(parse({ ...h3Base, mode: "text" }).success, false, "アスペクト比なし");
  assert.equal(
    parse({ ...h3Base, mode: "text", aspectRatio: "16:9", referenceImageKeys: ["uploads/u1/r.jpg"] })
      .success,
    false
  );
});

test("H3 reference: 素材1件以上・合計12件まで", () => {
  assert.equal(
    parse({ ...h3Base, mode: "reference", aspectRatio: "16:9" }).success,
    false,
    "素材なし"
  );

  // 画像6 + 動画3 + 音声3 = 12件ちょうどは通る
  assert.ok(
    parse({
      ...h3Base,
      mode: "reference",
      aspectRatio: "16:9",
      referenceImageKeys: Array.from({ length: 6 }, (_, i) => `uploads/u1/i${i}.jpg`),
      referenceVideoKeys: Array.from({ length: 3 }, (_, i) => `uploads/u1/v${i}.mp4`),
      referenceAudioKeys: Array.from({ length: 3 }, (_, i) => `uploads/u1/a${i}.wav`),
    }).success
  );

  // 画像は最大9枚
  assert.equal(
    parse({
      ...h3Base,
      mode: "reference",
      aspectRatio: "16:9",
      referenceImageKeys: Array.from({ length: 10 }, (_, i) => `uploads/u1/i${i}.jpg`),
    }).success,
    false
  );

  // 合計13件は上限超過
  assert.equal(
    parse({
      ...h3Base,
      mode: "reference",
      aspectRatio: "16:9",
      referenceImageKeys: Array.from({ length: 9 }, (_, i) => `uploads/u1/i${i}.jpg`),
      referenceVideoKeys: ["uploads/u1/v0.mp4", "uploads/u1/v1.mp4"],
      referenceAudioKeys: ["uploads/u1/a0.wav", "uploads/u1/a1.wav"],
    }).success,
    false
  );
});

test("H3 reference: 音声のみの参照も受け付ける(公式は any combination とだけ記載)", () => {
  assert.ok(
    parse({
      ...h3Base,
      mode: "reference",
      aspectRatio: "16:9",
      referenceAudioKeys: ["uploads/u1/a.wav"],
    }).success
  );
});

test("H3: duration は 4〜15、解像度は 768P / 2K のみ、一括生成は1本固定", () => {
  assert.equal(parse({ ...h3Base, mode: "text", aspectRatio: "16:9", durationSeconds: 3 }).success, false);
  assert.equal(parse({ ...h3Base, mode: "text", aspectRatio: "16:9", durationSeconds: 16 }).success, false);
  assert.equal(parse({ ...h3Base, mode: "text", aspectRatio: "16:9", resolution: "1080p" }).success, false);
  assert.equal(parse({ ...h3Base, mode: "text", aspectRatio: "16:9", batchSize: 2 }).success, false);
  assert.ok(parse({ ...h3Base, mode: "text", aspectRatio: "16:9", batchSize: 1 }).success);
});

test("H3 の既定モードは 画像から動画", () => {
  const result = parse({ ...h3Base, firstFrameImageKey: "uploads/u1/a.jpg" });
  assert.ok(result.success);
  assert.equal(result.data.mode, "image");
});
