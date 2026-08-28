"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ModelSelect } from "./ModelSelect";
import { SeedanceForm } from "./SeedanceForm";
import { MiniMaxH3Form } from "./minimax/MiniMaxH3Form";
import { JobStatusCard } from "./JobStatusCard";
import { useGenerationJobs } from "./useGenerationJobs";
import { normalizeOptionLimits, type GenerationOptionLimits } from "./option-limits";
import {
  DEFAULT_VIDEO_MODEL,
  getModelSpec,
  isVideoModelId,
  LEGACY_VIDEO_MODEL,
  VIDEO_MODELS,
  type VideoModelId,
} from "@/lib/generation/models";
import { GENERATION_MODES, type GenerationMode } from "@/lib/generation/options";

/**
 * 生成画面のシェル。モデル選択と、モデルごとの専用フォームの振り分けを担う。
 *
 * 選択中のモデルとモードは URL クエリ(?model= / ?mode=)に持たせる。フォーム内の
 * state だけで持つとリロードや戻る操作で選択が失われ、履歴からの「引用」導線
 * (/?model=...&fromJobId=...) でも正しいフォームを開けない。
 */
export function GenerationWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionLimits, setOptionLimits] = useState<GenerationOptionLimits | null>(null);
  const { balance, jobs, addJobs } = useGenerationJobs();

  useEffect(() => {
    fetch("/api/generate/options")
      .then((r) => r.json())
      .then((limits) => setOptionLimits(normalizeOptionLimits(limits)))
      .catch(() => setOptionLimits(null))
      .finally(() => setOptionsLoading(false));
  }, []);

  const availableModels = useMemo<VideoModelId[]>(() => {
    // 許可設定を取得できなかった場合は従来モデルだけに絞る
    // (未知のサーバーに対して新しいモデルを勝手に有効化しない)。
    if (!optionLimits) return [LEGACY_VIDEO_MODEL];
    const allowed = VIDEO_MODELS.filter((id) => optionLimits.allowedModels.includes(id));
    return allowed.length > 0 ? allowed : [LEGACY_VIDEO_MODEL];
  }, [optionLimits]);

  const modelParam = searchParams.get("model");
  const requestedModel: VideoModelId =
    modelParam && isVideoModelId(modelParam) ? modelParam : DEFAULT_VIDEO_MODEL;
  const model = availableModels.includes(requestedModel) ? requestedModel : availableModels[0];
  const spec = getModelSpec(model);

  const modeParam = searchParams.get("mode");
  const requestedMode =
    modeParam && (GENERATION_MODES as readonly string[]).includes(modeParam)
      ? (modeParam as GenerationMode)
      : spec.defaultMode;
  const mode = spec.modes.includes(requestedMode) ? requestedMode : spec.defaultMode;

  const replaceQuery = useCallback(
    (next: { model?: VideoModelId; mode?: GenerationMode }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.model) params.set("model", next.model);
      if (next.mode) params.set("mode", next.mode);
      // モデルを変えたら前のモデルの「引用」プリフィルは無効になるので落とす
      if (next.model) params.delete("fromJobId");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleModelChange = useCallback(
    (nextModel: VideoModelId) => {
      replaceQuery({ model: nextModel, mode: getModelSpec(nextModel).defaultMode });
    },
    [replaceQuery]
  );

  const handleModeChange = useCallback(
    (nextMode: GenerationMode) => replaceQuery({ mode: nextMode }),
    [replaceQuery]
  );

  const handleSubmitted = useCallback(
    (jobIds: string[]) => {
      addJobs(jobIds.map((id) => ({ id, status: "PENDING" as const })));
    },
    [addJobs]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-xl font-semibold">動画生成</h1>

      {/* 許可設定を取得するまでフォームを描画しない。
          先に既定のフォームを出すと、取得完了後に別モデルのフォームへ差し替わって
          一瞬だけ違う入力欄が見える(入力途中なら内容も失われる)。 */}
      {optionsLoading ? (
        <p className="mt-6 text-sm text-neutral-500">読み込み中...</p>
      ) : (
        <>
          <div className="mt-6">
            <ModelSelect models={availableModels} value={model} onChange={handleModelChange} />
          </div>

          {model === "minimax-h3" ? (
            <MiniMaxH3Form
              limits={optionLimits}
              optionsLoading={optionsLoading}
              balance={balance}
              mode={mode}
              onModeChange={handleModeChange}
              onSubmitted={handleSubmitted}
            />
          ) : (
            <SeedanceForm
              limits={optionLimits}
              optionsLoading={optionsLoading}
              balance={balance}
              mode={mode}
              onModeChange={handleModeChange}
              onSubmitted={handleSubmitted}
            />
          )}
        </>
      )}

      {jobs.length > 0 && (
        <div className="mt-10">
          {/* 生成履歴への導線がアカウントメニュー内だけだと見つけにくいため、
              直近ジョブの見出し行にも一覧へのリンクを置く */}
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-neutral-300">生成状況</h2>
            <Link
              href="/history"
              className="shrink-0 text-xs text-neutral-400 underline-offset-4 hover:text-neutral-100 hover:underline"
            >
              全ての生成履歴を見る →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {jobs.map((job) => (
              <JobStatusCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
