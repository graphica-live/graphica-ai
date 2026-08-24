import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMention,
  findMentionQuery,
  matchesMentionQuery,
  normalizeMentionsForDreamina,
  referenceImageTag,
  referenceVideoTag,
} from "./mention";

// Seedance: tag が `@image1` なので filterKeys 未指定で先頭の `@` だけ落ちる
test("filterKeys 未指定なら tag から先頭の @ を除いたキーで絞り込む", () => {
  assert.ok(matchesMentionQuery("@image1", undefined, ""));
  assert.ok(matchesMentionQuery("@image1", undefined, "im"));
  assert.ok(matchesMentionQuery("@image1", undefined, "image1"));
  assert.ok(!matchesMentionQuery("@image1", undefined, "vid"));
  // `@` 込みでは一致させない(`@` はトリガーであり検索語に含まれない)
  assert.ok(!matchesMentionQuery("@image1", undefined, "@image1"));
});

test("絞り込みは大文字小文字を区別しない", () => {
  assert.ok(matchesMentionQuery("@video2", undefined, "VID"));
  assert.ok(matchesMentionQuery("@Video2", undefined, "vid"));
});

// MiniMax H3: 挿入されるのは日本語ラベル。ローマ字と番号でも引けること
test("H3 のラベル候補はラベル・ローマ字・番号のどれでも絞り込める", () => {
  const keys = ["画像1", "image1", "1"];
  assert.ok(matchesMentionQuery("画像1", keys, ""));
  assert.ok(matchesMentionQuery("画像1", keys, "画像"));
  assert.ok(matchesMentionQuery("画像1", keys, "im"));
  assert.ok(matchesMentionQuery("画像1", keys, "1"));
  assert.ok(!matchesMentionQuery("画像1", keys, "動画"));
  assert.ok(!matchesMentionQuery("画像1", keys, "2"));
});

test("H3 のラベルは filterKeys 無しだと日本語1文字ぶんが欠ける(明示が必要)", () => {
  // tag.replace(/^@/,"") は「画像1」をそのまま返すため、ラベル自体では引ける。
  // ただしローマ字・番号では引けないので、H3側は filterKeys を必ず渡す。
  assert.ok(matchesMentionQuery("画像1", undefined, "画像"));
  assert.ok(!matchesMentionQuery("画像1", undefined, "image"));
});

test("カーソル直前のメンションを検出し、空白で区切られたら検出しない", () => {
  assert.deepEqual(findMentionQuery("@ima", 4), { start: 0, query: "ima" });
  // 日本語プロンプトは単語間に空白を置かないため、文中の `@` も検出する
  assert.deepEqual(findMentionQuery("猫が@ima", 6), { start: 2, query: "ima" });
  assert.equal(findMentionQuery("@image1 が歩く", 11), null);
  assert.equal(findMentionQuery("メンションなし", 7), null);
});

test("候補を選ぶとトリガーの @ ごと置換され、末尾に空白が付く", () => {
  const mention = findMentionQuery("猫が@im", 5);
  assert.ok(mention);
  // Seedance: タグがそのまま入る
  assert.deepEqual(applyMention("猫が@im", mention, 5, "@image1"), {
    value: "猫が@image1 ",
    caretIndex: 10,
  });
  // H3: `@` は消え、プレーンテキストのラベルだけが残る
  assert.deepEqual(applyMention("猫が@im", mention, 5, "画像1"), {
    value: "猫が画像1 ",
    caretIndex: 6,
  });
});

test("タグは表示順のインデックスから導出する", () => {
  assert.equal(referenceImageTag(0), "@image1");
  assert.equal(referenceVideoTag(2), "@video3");
});

test("Dreamina送信時だけタグを先頭大文字へ正規化する", () => {
  assert.equal(
    normalizeMentionsForDreamina("@image1 と @video2 を合成"),
    "@Image1 と @Video2 を合成"
  );
  // H3 のラベルはタグではないので影響を受けない
  assert.equal(normalizeMentionsForDreamina("画像1の人物が"), "画像1の人物が");
});
