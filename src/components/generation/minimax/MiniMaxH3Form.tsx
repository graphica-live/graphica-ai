"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImageUploadField, type UploadedImage } from "../ImageUploadField";
import { VideoUploadField, type UploadedVideo } from "../VideoUploadField";
import { AudioUploadField, type UploadedAudio } from "../AudioUploadField";
import { CostEstimate } from "../CostEstimate";
import { MentionTextarea, type MentionCandidate } from "../MentionTextarea";
import { H3ModeTabs } from "./H3ModeTabs";
import type { GenerationOptionLimits } from "../option-limits";
import { estimateGenerationCostJpy } from "@/lib/credits/cost";
import { MINIMAX_H3_PRICING } from "@/lib/credits/model-pricing";
import { allowedAspectRatiosFor, getModelSpec, modeLabel } from "@/lib/generation/models";
import {
  ASPECT_RATIOS,
  GENERATION_MODE_LABELS,
  clampDurationSeconds,
  type AspectRatio,
  type GenerationMode,
} from "@/lib/generation/options";

const MODEL_ID = "minimax-h3" as const;
const SPEC = getModelSpec(MODEL_ID);

// H3 の参照は content[] の並び順で行われる（公式にメンションタグの仕様は無い）。
// UI上の番号がそのまま並び順であることを示すため、@image1 ではなく「画像1」と表示する。
const imageLabel = (i: number) => `画像${i + 1}`;
const videoLabel = (i: number) => `動画${i + 1}`;
const audioLabel = (i: number) => `音声${i + 1}`;

const REFERENCE_HINT =
  "番号は上から順に対応します。プロンプト内では「画像1の人物が」のように番号で指定してください";

function usdEstimate(resolution: string, durationSeconds: number, referenceImageCount: number) {
  const rate = MINIMAX_H3_PRICING.outputUsdPerSecond[resolution];
  if (rate === undefined) return null;
  const extraImages = Math.max(0, referenceImageCount - MINIMAX_H3_PRICING.freeInputImages);
  return rate * durationSeconds + extraImages * MINIMAX_H3_PRICING.extraInputImageUsd;
}

export function MiniMaxH3Form({
  limits: optionLimits,
  optionsLoading,
  balance,
  mode,
  onModeChange,
  onSubmitted,
}: {
  limits: GenerationOptionLimits | null;
  optionsLoading: boolean;
  balance: number | null;
  mode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  onSubmitted: (jobIds: string[]) => void;
}) {
  const searchParams = useSearchParams();
  const fromJobId = searchParams.get("fromJobId");

  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<UploadedVideo[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<UploadedAudio[]>([]);
  // ImageUploadFieldは配列APIなので、単一画像は長さ0..1の配列として保持する
  const [firstFrameImages, setFirstFrameImages] = useState<UploadedImage[]>([]);
  const [endFrameImages, setEndFrameImages] = useState<UploadedImage[]>([]);
  const [resolution, setResolution] = useState<string>(SPEC.defaultResolution);
  const [durationSeconds, setDurationSeconds] = useState<number>(SPEC.defaultDuration);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // H3 の解像度はスタッフ単位では制限しない（コスト統制は allowedModels と動画長で行う）
  const allowedResolutions = SPEC.resolutions;
  const allowedAspectRatios = useMemo(
    () => allowedAspectRatiosFor(SPEC, optionLimits?.allowedAspectRatios),
    [optionLimits]
  );

  // 動画長のみスタッフごとの範囲制限をH3にも適用する（秒数はモデル非依存の課金要因）
  const durationMin = Math.max(SPEC.durationMin, optionLimits?.minDurationSeconds ?? SPEC.durationMin);
  const durationMax = Math.min(SPEC.durationMax, optionLimits?.maxDurationSeconds ?? SPEC.durationMax);
  const durationFixed = durationMin >= durationMax;
  const durationFillPercent = durationFixed
    ? 100
    : ((durationSeconds - durationMin) / (durationMax - durationMin)) * 100;

  // 許可設定のロード後、選択中の値が対象外なら許可された値へ補正する
  useEffect(() => {
    if (!optionLimits) return;
    const clamped = clampDurationSeconds(durationSeconds, durationMin, durationMax);
    if (clamped !== durationSeconds) setDurationSeconds(clamped);
    if (allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(allowedAspectRatios[0]);
    }
  }, [optionLimits, durationMin, durationMax, durationSeconds, allowedAspectRatios, aspectRatio]);

  // 「引用」導線: 過去のH3ジョブの設定をプリフィルする
  useEffect(() => {
    if (!fromJobId) return;
    fetch(`/api/jobs/${fromJobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (!job || job.model !== MODEL_ID) return;
        setPrompt(job.prompt ?? "");
        if (typeof job.resolution === "string") setResolution(job.resolution);
        if (typeof job.durationSeconds === "number") setDurationSeconds(job.durationSeconds);
        if ((ASPECT_RATIOS as readonly string[]).includes(job.aspectRatio)) {
          setAspectRatio(job.aspectRatio as AspectRatio);
        }

        const restored: GenerationMode | undefined = job.generationMode;
        if (restored && (SPEC.modes as readonly string[]).includes(restored)) {
          onModeChange(restored);
        }

        if (job.firstFrameImageKey && job.firstFrameImageUrl) {
          setFirstFrameImages([
            { key: job.firstFrameImageKey, previewUrl: job.firstFrameImageUrl },
          ]);
        }
        if (job.endFrameImageKey && job.endFrameImageUrl) {
          setEndFrameImages([{ key: job.endFrameImageKey, previewUrl: job.endFrameImageUrl }]);
        }
        if (Array.isArray(job.referenceImageKeys) && Array.isArray(job.referenceImageUrls)) {
          setReferenceImages(
            job.referenceImageKeys.map((key: string, i: number) => ({
              key,
              previewUrl: job.referenceImageUrls[i],
            }))
          );
        }
        if (Array.isArray(job.referenceVideoKeys) && Array.isArray(job.referenceVideoUrls)) {
          setReferenceVideos(
            job.referenceVideoKeys.map((key: string, i: number) => ({
              key,
              previewUrl: job.referenceVideoUrls[i],
              durationSeconds: 0,
            }))
          );
        }
        // 参照音声はサムネイルを持たず、尺もジョブに保存していないため復元しない
      })
      .catch(() => {
        /* プリフィルに失敗しても空のフォームから生成できる */
      });
    // onModeChange は親で useCallback 済み。fromJobId 変化時にだけ復元する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromJobId]);

  const usesFrames = mode === "image" || mode === "firstlast";
  const isReferenceMode = mode === "reference";
  const firstFrame = firstFrameImages[0] ?? null;
  const endFrame = endFrameImages[0] ?? null;
  const referenceCount =
    referenceImages.length + referenceVideos.length + referenceAudios.length;

  // Seedance と同じ `@` 操作で参照素材を指し示せるようにする。ただし H3 には
  // メンションタグの仕様が無いため、挿入されるのは `@image1` ではなく「画像1」
  // というプレーンテキストで、そのままプロンプトとして送信される。
  // 日本語IMEでは `@` の直後にローマ字が残ることがあるため、絞り込みキーには
  // 表示ラベルに加えて image1 / video1 / audio1 と番号だけの形も持たせる。
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!isReferenceMode) return [];
    return [
      ...referenceImages.map((image, i) => ({
        tag: imageLabel(i),
        filterKeys: [imageLabel(i), `image${i + 1}`, `${i + 1}`],
        previewUrl: image.previewUrl,
      })),
      ...referenceVideos.map((video, i) => ({
        tag: videoLabel(i),
        filterKeys: [videoLabel(i), `video${i + 1}`, `${i + 1}`],
        previewUrl: video.previewUrl,
      })),
      // 参照音声はサムネイルを持たないため previewUrl を渡さない
      ...referenceAudios.map((_, i) => ({
        tag: audioLabel(i),
        filterKeys: [audioLabel(i), `audio${i + 1}`, `${i + 1}`],
      })),
    ];
  }, [isReferenceMode, referenceImages, referenceVideos, referenceAudios]);

  // サーバーが仮押さえするのと同じ式で概算する(@/lib/credits/cost)。
  // 参照動画がある場合はAPI上限の15秒ぶんを満額で仮押さえし、完了時に実尺で精算する。
  const hasVideoInput = isReferenceMode && referenceVideos.length > 0;
  const referenceImageCount = isReferenceMode ? referenceImages.length : 0;
  const costPerVideo = useMemo(() => {
    try {
      return estimateGenerationCostJpy({
        model: MODEL_ID,
        resolution,
        durationSeconds,
        hasVideoInput,
        referenceImageCount,
      });
    } catch {
      return null;
    }
  }, [resolution, durationSeconds, hasVideoInput, referenceImageCount]);

  const usd = usdEstimate(resolution, durationSeconds, referenceImageCount);
  const insufficient = costPerVideo !== null && balance !== null && costPerVideo > balance;

  const promptReady = prompt.trim().length > 0;
  const inputReady =
    promptReady &&
    (mode === "text"
      ? true
      : mode === "image"
        ? firstFrame !== null
        : mode === "firstlast"
          ? firstFrame !== null && endFrame !== null
          : referenceCount > 0 && referenceCount <= SPEC.limits.maxTotalReferenceFiles);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const common = { model: MODEL_ID, mode, prompt, resolution, durationSeconds };
      // モードごとに排他な項目だけを送る(混在するとサーバー側で400になる)
      const payload = usesFrames
        ? {
            ...common,
            firstFrameImageKey: firstFrame?.key,
            endFrameImageKey: mode === "firstlast" ? endFrame?.key : undefined,
          }
        : {
            ...common,
            aspectRatio,
            referenceImageKeys: isReferenceMode ? referenceImages.map((i) => i.key) : [],
            referenceVideoKeys: isReferenceMode ? referenceVideos.map((v) => v.key) : [],
            referenceAudioKeys: isReferenceMode ? referenceAudios.map((a) => a.key) : [],
          };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(typeof data.error === "string" ? data.error : "生成の開始に失敗しました");
        return;
      }
      onSubmitted(data.jobIds as string[]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-6">
        <H3ModeTabs
          modes={SPEC.modes}
          value={mode}
          labelFor={(m) => modeLabel(SPEC, m, GENERATION_MODE_LABELS)}
          onChange={onModeChange}
        />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {mode === "image" && (
          <ImageUploadField
            images={firstFrameImages}
            onChange={setFirstFrameImages}
            label="開始画像"
            maxImages={1}
            showTag={false}
            allowedTypes={SPEC.media.imageTypes}
            maxBytes={SPEC.media.maxImageBytes}
          />
        )}

        {mode === "firstlast" && (
          <>
            <ImageUploadField
              images={firstFrameImages}
              onChange={setFirstFrameImages}
              label="開始画像"
              maxImages={1}
              showTag={false}
              allowedTypes={SPEC.media.imageTypes}
              maxBytes={SPEC.media.maxImageBytes}
            />
            <ImageUploadField
              images={endFrameImages}
              onChange={setEndFrameImages}
              label="終了画像"
              maxImages={1}
              showTag={false}
              allowedTypes={SPEC.media.imageTypes}
              maxBytes={SPEC.media.maxImageBytes}
            />
          </>
        )}

        {isReferenceMode && (
          <>
            <ImageUploadField
              images={referenceImages}
              onChange={setReferenceImages}
              label="参照画像"
              maxImages={SPEC.limits.maxReferenceImages}
              allowedTypes={SPEC.media.imageTypes}
              maxBytes={SPEC.media.maxImageBytes}
              tagFor={imageLabel}
              hint={REFERENCE_HINT}
              layout="grid"
            />
            <VideoUploadField
              videos={referenceVideos}
              onChange={setReferenceVideos}
              label="参照動画"
              maxVideos={SPEC.limits.maxReferenceVideos}
              allowedTypes={SPEC.media.videoTypes}
              maxBytes={SPEC.media.maxVideoBytes}
              minDurationSeconds={SPEC.media.refClipMinSeconds}
              maxDurationSeconds={SPEC.media.refClipMaxSeconds}
              maxTotalDurationSeconds={SPEC.media.refTotalMaxSeconds}
              tagFor={videoLabel}
              hint={REFERENCE_HINT}
              layout="grid"
            />
            <AudioUploadField
              audios={referenceAudios}
              onChange={setReferenceAudios}
              maxAudios={SPEC.limits.maxReferenceAudios}
              allowedTypes={SPEC.media.audioTypes}
              maxBytes={SPEC.media.maxAudioBytes}
              minDurationSeconds={SPEC.media.refClipMinSeconds}
              maxDurationSeconds={SPEC.media.refClipMaxSeconds}
              maxTotalDurationSeconds={SPEC.media.refTotalMaxSeconds}
              tagFor={audioLabel}
              hint={REFERENCE_HINT}
            />
            <p className="-mt-2 text-xs text-neutral-500">
              参照素材は合計{SPEC.limits.maxTotalReferenceFiles}件までです（現在{referenceCount}件）
            </p>
          </>
        )}

        <div>
          <label htmlFor="h3-prompt" className="mb-2 block text-sm font-medium text-neutral-300">
            プロンプト
          </label>
          <MentionTextarea
            id="h3-prompt"
            value={prompt}
            onChange={setPrompt}
            candidates={mentionCandidates}
            maxLength={SPEC.maxPromptLength}
            rows={4}
            placeholder={
              mode === "text"
                ? "生成したい動画の内容を入力してください"
                : isReferenceMode
                  ? "素材をどう使ってどんな動画にしたいかを入力してください( @ で「画像1」のような番号を挿入できます)"
                  : "素材をどう使ってどんな動画にしたいかを入力してください"
            }
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-neutral-500">
            {prompt.length}/{SPEC.maxPromptLength}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="h3-resolution" className="mb-2 block text-sm font-medium text-neutral-300">
              解像度
            </label>
            <select
              id="h3-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              {allowedResolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="h3-ratio" className="mb-2 block text-sm font-medium text-neutral-300">
              アスペクト比
            </label>
            {usesFrames ? (
              // H3 は開始画像のアスペクト比を継承し ratio は adaptive 固定。
              // 2カラムグリッドは狭い画面でも維持されるため、隣のselectと高さがずれない
              // 短い文言にし、説明はグリッド下の補助行に置く。
              <p className="rounded-md border border-dashed border-neutral-800 px-3 py-2 text-sm text-neutral-500">
                自動
              </p>
            ) : (
              <select
                id="h3-ratio"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              >
                {allowedAspectRatios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="h3-duration" className="text-sm font-medium text-neutral-300">
              長さ
            </label>
            <span className="text-sm font-medium tabular-nums text-neutral-100">
              {durationSeconds}秒{durationFixed && "(固定)"}
            </span>
          </div>
          <input
            id="h3-duration"
            type="range"
            min={durationMin}
            max={durationMax}
            step={1}
            value={durationSeconds}
            disabled={durationFixed}
            onChange={(e) =>
              setDurationSeconds(
                clampDurationSeconds(Number(e.target.value), durationMin, durationMax)
              )
            }
            style={{
              background: `linear-gradient(to right, #a3a3a3 ${durationFillPercent}%, #262626 ${durationFillPercent}%)`,
            }}
            className="duration-slider"
          />
          <div className="mt-1 flex justify-between text-xs text-neutral-500">
            <span>{durationMin}秒</span>
            <span>{durationMax}秒</span>
          </div>
        </div>

        {usesFrames && (
          <p className="-mt-4 text-xs text-neutral-500">
            アスペクト比は開始画像のアスペクト比に追従します
          </p>
        )}

        <p className="text-xs text-neutral-500">音声はモデルが自動で生成します</p>

        <div>
          <CostEstimate cost={costPerVideo} balance={balance} />
          {usd !== null && (
            <p className="mt-1 text-xs text-neutral-500">
              MiniMax H3 / {resolution} / {durationSeconds}秒 ・ 推定API料金 ${usd.toFixed(2)}
              {hasVideoInput &&
                `（参照動画がある場合は最大${MINIMAX_H3_PRICING.maxInputVideoSeconds}秒ぶんを仮押さえし、完了時に実使用量で精算します）`}
            </p>
          )}
        </div>

        {submitError && (
          <p className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            {submitError}
          </p>
        )}

        {/* 入力欄が長くなるモードでも生成ボタンへ届きやすいよう、狭い画面では下端に固定する */}
        <div className="sticky bottom-0 -mx-4 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <button
            type="submit"
            disabled={submitting || !inputReady || insufficient || optionsLoading}
            className="w-full rounded-md bg-neutral-100 py-3 text-sm font-semibold text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {insufficient ? "クレジット残高が不足しています" : submitting ? "送信中..." : "生成"}
          </button>
        </div>
      </form>
    </>
  );
}
