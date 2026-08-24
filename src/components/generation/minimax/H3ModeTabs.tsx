"use client";

import { useEffect, useRef } from "react";
import type { GenerationMode } from "@/lib/generation/options";

/**
 * H3 の生成方法タブ。
 *
 * MiniMax H3 は first/last frame 方式と reference 素材方式を公式に併用できないため、
 * 「エラーで弾く」のではなくタブで入力欄そのものを分離する。上級機能である参照素材の
 * 入力欄は、そのタブを選ぶまで描画しない。
 *
 * 4タブは 375px 幅だと収まりきらないため横スクロールさせる。親のpx-4を打ち消して
 * 画面端まで流れるようにし、スクロールできることが視覚的に分かるようにする。
 */
export function H3ModeTabs({
  modes,
  value,
  labelFor,
  onChange,
}: {
  modes: readonly GenerationMode[];
  value: GenerationMode;
  labelFor: (mode: GenerationMode) => string;
  onChange: (mode: GenerationMode) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // 狭い画面では選択中のタブが右端で見切れることがある(URLで直接modeを指定して
  // 開いた場合など)。今どのモードにいるかが分からなくなるのでスクロールで見せる。
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">生成方法</p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div
          role="tablist"
          aria-label="生成方法"
          className="inline-flex w-max gap-1 rounded-md border border-neutral-800 bg-neutral-900 p-1"
        >
          {modes.map((mode) => (
            <button
              key={mode}
              ref={value === mode ? selectedRef : undefined}
              type="button"
              role="tab"
              aria-selected={value === mode}
              onClick={() => onChange(mode)}
              className={`whitespace-nowrap rounded px-4 py-2 text-sm font-medium transition-colors ${
                value === mode
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {labelFor(mode)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
