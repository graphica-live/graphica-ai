"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyMention,
  findMentionQuery,
  matchesMentionQuery,
  type MentionQuery,
} from "@/lib/generation/mention";
import { getCaretCoordinates } from "@/lib/generation/textarea-caret";

export interface MentionCandidate {
  /** プロンプトへ挿入され、候補リストにも表示される文字列 */
  tag: string;
  /**
   * `@` の直後に入力された文字列との前方一致に使うキー。省略時は tag から
   * 先頭の `@` を除いたものを使う。MiniMax H3 のように挿入文字列が日本語ラベル
   * (「画像1」)の場合、ローマ字や番号でも絞り込めるよう複数指定する。
   */
  filterKeys?: readonly string[];
  /** 候補に表示するサムネイル。参照音声のようにサムネイルを持たない素材では省略する */
  previewUrl?: string;
}

/** 候補ポップアップの幅。はみ出し判定に使うため className ではなく style で当てる */
const POPUP_WIDTH_PX = 192;

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  candidates: MentionCandidate[];
  id?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

/**
 * `@` 入力で参照素材の候補をポップアップ表示し、選択するとカーソル位置へ
 * 候補の文字列を挿入するプロンプト入力欄。
 *
 * 挿入される文字列はモデルによって異なる。Seedance 2.5 は API が解釈する
 * `@image1` というタグを、MiniMax H3 はタグ仕様を持たないため「画像1」という
 * プレーンテキストを挿入する(トリガーの `@` 自体は置換で消える)。
 */
export function MentionTextarea({
  value,
  onChange,
  candidates,
  id,
  rows = 4,
  maxLength,
  placeholder,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  const filteredCandidates = mention
    ? candidates.filter((c) => matchesMentionQuery(c.tag, c.filterKeys, mention.query))
    : [];

  useEffect(() => {
    setHighlightedIndex(0);
  }, [mention?.query, mention?.start]);

  function syncMentionState(el: HTMLTextAreaElement) {
    const caretIndex = el.selectionStart ?? 0;
    const next = findMentionQuery(el.value, caretIndex);
    setMention(next);
    if (next) {
      const coords = getCaretCoordinates(el, caretIndex);
      // カーソルが右端寄りだとポップアップが入力欄からはみ出し、狭い画面で
      // 横スクロールが発生する。入力欄の右端に収まる位置まで戻す。
      const maxLeft = Math.max(0, el.offsetWidth - POPUP_WIDTH_PX);
      setPopupPos({ top: coords.top + coords.height, left: Math.min(coords.left, maxLeft) });
    } else {
      setPopupPos(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    onChange(nextValue);
    syncMentionState(e.target);
  }

  function selectCandidate(candidate: MentionCandidate) {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const caretIndex = el.selectionStart ?? value.length;
    const result = applyMention(value, mention, caretIndex, candidate.tag);
    // 挿入で上限を超えることがあるため、手入力(handleChange)と同じ位置で切り詰める
    const nextValue = maxLength ? result.value.slice(0, maxLength) : result.value;
    const nextCaret = Math.min(result.caretIndex, nextValue.length);
    onChange(nextValue);
    setMention(null);
    setPopupPos(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || filteredCandidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % filteredCandidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + filteredCandidates.length) % filteredCandidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectCandidate(filteredCandidates[highlightedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
      setPopupPos(null);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onSelect={(e) => syncMentionState(e.currentTarget)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 候補ボタンのmousedownを先に処理させるため少し遅延して閉じる
          setTimeout(() => {
            setMention(null);
            setPopupPos(null);
          }, 150);
        }}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {mention && popupPos && filteredCandidates.length > 0 && (
        <div
          className="absolute z-20 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg"
          style={{ top: popupPos.top, left: popupPos.left, width: POPUP_WIDTH_PX }}
        >
          {filteredCandidates.map((candidate, i) => (
            <button
              key={candidate.tag}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectCandidate(candidate);
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                i === highlightedIndex ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {candidate.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={candidate.previewUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded object-cover" />
              ) : (
                // 参照音声はサムネイルを作れないため、枠だけ置いて行の高さを揃える
                <span className="h-6 w-6 flex-shrink-0 rounded bg-neutral-800" />
              )}
              <span>{candidate.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
