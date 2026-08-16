"use client";

import { useEffect, useRef, useState } from "react";
import { applyMention, findMentionQuery, type MentionQuery } from "@/lib/generation/mention";
import { getCaretCoordinates } from "@/lib/generation/textarea-caret";

export interface MentionCandidate {
  tag: string;
  previewUrl: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  candidates: MentionCandidate[];
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

/**
 * `@` 入力で参照画像の候補をポップアップ表示し、選択すると `@image1` のような
 * タグをカーソル位置に挿入するプロンプト入力欄。
 */
export function MentionTextarea({
  value,
  onChange,
  candidates,
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
    ? candidates.filter((c) => c.tag.slice(1).toLowerCase().startsWith(mention.query.toLowerCase()))
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
      setPopupPos({ top: coords.top + coords.height, left: coords.left });
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
    onChange(result.value);
    setMention(null);
    setPopupPos(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.caretIndex, result.caretIndex);
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
          className="absolute z-20 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg"
          style={{ top: popupPos.top, left: popupPos.left }}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={candidate.previewUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded object-cover" />
              <span>{candidate.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
