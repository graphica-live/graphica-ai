import assert from "node:assert/strict";
import test from "node:test";
import { assertOwnedUploadKeys, ForeignUploadKeyError } from "./upload-key";

test("自分の uploads/ 配下のキーは通る", () => {
  assert.doesNotThrow(() =>
    assertOwnedUploadKeys("user-1", [
      "uploads/user-1/abc-a.jpg",
      "uploads/user-1/def-b.mp4",
      "uploads/user-1/ghi-c.wav",
    ])
  );
});

test("undefined / null は指定なしとして扱う", () => {
  assert.doesNotThrow(() => assertOwnedUploadKeys("user-1", [undefined, null]));
});

test("他人のキーは拒否する", () => {
  assert.throws(
    () => assertOwnedUploadKeys("user-1", ["uploads/user-2/abc-a.jpg"]),
    ForeignUploadKeyError
  );
});

test("接頭辞が前方一致するだけの別ユーザーを通さない", () => {
  // "uploads/user-1" で startsWith すると "uploads/user-10/..." が通ってしまう
  assert.throws(
    () => assertOwnedUploadKeys("user-1", ["uploads/user-10/abc-a.jpg"]),
    ForeignUploadKeyError
  );
});

test("生成物や uploads 以外のキーは拒否する", () => {
  assert.throws(
    () => assertOwnedUploadKeys("user-1", ["generations/job-1/graphica-video-job-1.mp4"]),
    ForeignUploadKeyError
  );
});

test("相対パスで接頭辞チェックをすり抜けさせない", () => {
  assert.throws(
    () => assertOwnedUploadKeys("user-1", ["uploads/user-1/../user-2/a.jpg"]),
    ForeignUploadKeyError
  );
});
