import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMiniMaxRequestBody,
  classifyMiniMaxHttpError,
  mapMiniMaxStatus,
  MINIMAX_H3_MODEL,
} from "./minimax-provider";
import { RetryableProviderError, TerminalProviderError } from "./types";
import type { VideoGenerationRequest } from "./types";
import type { GenerationMode } from "@/lib/generation/options";

function req(overrides: Partial<VideoGenerationRequest> & { mode: GenerationMode }): VideoGenerationRequest {
  return {
    model: "minimax-h3",
    prompt: "海辺を走る犬",
    referenceImages: [],
    referenceVideos: [],
    referenceAudios: [],
    resolution: "768P",
    durationSeconds: 5,
    aspectRatio: "16:9",
    generateAudio: true,
    ...overrides,
  };
}

test("text mode: テキストのみを送り ratio はユーザー指定を使う", () => {
  const body = buildMiniMaxRequestBody(req({ mode: "text" }));
  assert.equal(body.model, MINIMAX_H3_MODEL);
  assert.deepEqual(body.content, [{ type: "text", text: "海辺を走る犬" }]);
  assert.equal(body.ratio, "16:9");
  assert.equal(body.resolution, "768P");
  assert.equal(body.duration, 5);
});

test("image mode: first_frame のみ送り ratio は adaptive 固定", () => {
  const body = buildMiniMaxRequestBody(
    req({ mode: "image", firstFrameImageUrl: "https://x/a.jpg", endFrameImageUrl: "https://x/b.jpg" })
  );
  assert.equal(body.ratio, "adaptive");
  const roles = body.content.filter((c) => c.type === "image_url").map((c) => "role" in c && c.role);
  assert.deepEqual(roles, ["first_frame"]);
});

test("firstlast mode: first_frame と last_frame の両方を送る", () => {
  const body = buildMiniMaxRequestBody(
    req({
      mode: "firstlast",
      firstFrameImageUrl: "https://x/a.jpg",
      endFrameImageUrl: "https://x/b.jpg",
    })
  );
  assert.equal(body.ratio, "adaptive");
  const roles = body.content.filter((c) => c.type === "image_url").map((c) => "role" in c && c.role);
  assert.deepEqual(roles, ["first_frame", "last_frame"]);
});

test("reference mode: 画像・動画・音声を並び順どおりに送る", () => {
  const body = buildMiniMaxRequestBody(
    req({
      mode: "reference",
      referenceImages: [
        { tag: "@image1", url: "https://x/1.jpg" },
        { tag: "@image2", url: "https://x/2.jpg" },
      ],
      referenceVideos: [{ tag: "@video1", url: "https://x/1.mp4" }],
      referenceAudios: [{ tag: "@audio1", url: "https://x/1.wav" }],
      aspectRatio: "9:16",
    })
  );
  assert.equal(body.ratio, "9:16");
  assert.deepEqual(
    body.content.map((c) => ("role" in c ? c.role : c.type)),
    ["text", "reference_image", "reference_image", "reference_video", "reference_audio"]
  );
  // 参照の順序は content[] の並びで決まるため、UIの番号と一致していること
  const imageUrls = body.content
    .filter((c) => c.type === "image_url")
    .map((c) => (c.type === "image_url" ? c.image_url.url : ""));
  assert.deepEqual(imageUrls, ["https://x/1.jpg", "https://x/2.jpg"]);
});

test("reference mode でもフレーム画像は送らない(APIの排他制約)", () => {
  const body = buildMiniMaxRequestBody(
    req({
      mode: "reference",
      referenceImages: [{ tag: "@image1", url: "https://x/1.jpg" }],
      firstFrameImageUrl: "https://x/first.jpg",
    })
  );
  const roles = body.content.filter((c) => c.type === "image_url").map((c) => "role" in c && c.role);
  assert.deepEqual(roles, ["reference_image"]);
});

test("ステータスのマッピング: 未知の値は処理中として扱う", () => {
  assert.equal(mapMiniMaxStatus("queued"), "pending");
  assert.equal(mapMiniMaxStatus("running"), "processing");
  assert.equal(mapMiniMaxStatus("succeeded"), "completed");
  assert.equal(mapMiniMaxStatus("failed"), "failed");
  assert.equal(mapMiniMaxStatus("cancelled"), "failed");
  // 未知のステータスで生成中のジョブを失敗確定させない
  assert.equal(mapMiniMaxStatus("something-new"), "processing");
  assert.equal(mapMiniMaxStatus(undefined), "processing");
});

test("429 と 5xx は再試行可能、4xx は確定的な失敗として分類する", () => {
  assert.ok(classifyMiniMaxHttpError(429, {}) instanceof RetryableProviderError);
  assert.ok(classifyMiniMaxHttpError(500, {}) instanceof RetryableProviderError);
  assert.ok(classifyMiniMaxHttpError(503, {}) instanceof RetryableProviderError);

  for (const status of [400, 401, 402, 422]) {
    const err = classifyMiniMaxHttpError(status, {});
    assert.ok(err instanceof TerminalProviderError, `status=${status}`);
  }
});

test("ユーザー向けメッセージにプロバイダの生文言を混ぜない", () => {
  const err = classifyMiniMaxHttpError(400, {
    errorCode: "invalid_param",
    providerMessage: "content[1].image_url is invalid",
  });
  assert.ok(err instanceof TerminalProviderError);
  assert.equal(err.userMessage, "入力内容が不正です。素材やプロンプトを確認してください。");
  // 開発者向けの詳細は detail 側にだけ残す
  assert.equal(err.detail.providerMessage, "content[1].image_url is invalid");
  assert.equal(err.detail.errorCode, "invalid_param");
});
