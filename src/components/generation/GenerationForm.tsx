"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";
import { VideoUploadField, type UploadedVideo } from "./VideoUploadField";
import { MentionTextarea } from "./MentionTextarea";
import { CostEstimate } from "./CostEstimate";
import { JobStatusCard, type JobStatus } from "./JobStatusCard";
import { estimateSeedanceCostJpy } from "@/lib/credits/seedance-cost-estimate";
import { estimateCostJpy, type CostSample } from "@/lib/credits/empirical-cost-estimate";
import {
  RESOLUTIONS,
  ASPECT_RATIOS,
  ADAPTIVE_ASPECT_RATIO,
  GENERATION_MODES,
  GENERATION_MODE_LABELS,
  DURATION_MIN_SECONDS,
  DURATION_MAX_SECONDS,
  DEFAULT_DURATION_SECONDS,
  clampDurationSeconds,
  type GenerationMode,
} from "@/lib/generation/options";
import { referenceImageTag, referenceVideoTag } from "@/lib/generation/mention";

// BytePlus公式リファレンス上、image-to-video(先頭/末尾フレーム)と
// omni reference-to-video(参照画像・参照動画)は排他シナリオで併用できない。
// タブの境界をAPIの排他境界と一致させ、入力段階で混在を起こさないようにする。
// モードの値とラベルは管理画面の許可設定と共有するため @/lib/generation/options に置く。

interface GenerationOptionLimits {
  allowedResolutions: string[];
  // 動画長は1秒刻みのスライダーで選ぶため、許可リストではなく下限・上限で受け取る
  minDurationSeconds: number;
  maxDurationSeconds: number;
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
}

// /api/generate/options はエラー時に {error} を返すため、形にそぐわないレスポンスを
// そのまま制限として採用しない(採用すると allowedXxx が undefined になり描画時に落ちる)。
function isGenerationOptionLimits(value: unknown): value is GenerationOptionLimits {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.allowedResolutions) &&
    typeof v.minDurationSeconds === "number" &&
    typeof v.maxDurationSeconds === "number" &&
    Array.isArray(v.allowedAspectRatios) &&
    Array.isArray(v.allowedGenerationModes)
  );
}

interface PricingRule {
  resolution: string;
  hasVideoInput: boolean;
  creditPerSecond: number;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);
const RECENT_JOBS_LIMIT = 3;

export function GenerationForm() {
  const searchParams = useSearchParams();
  const fromJobId = searchParams.get("fromJobId");

  const [mode, setMode] = useState<GenerationMode>("reference");
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<UploadedVideo[]>([]);
  // ImageUploadFieldは配列APIなので、単一画像は長さ0..1の配列として保持する
  const [firstFrameImages, setFirstFrameImages] = useState<UploadedImage[]>([]);
  const [endFrameImages, setEndFrameImages] = useState<UploadedImage[]>([]);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [durationSeconds, setDurationSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("16:9");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [batchSize, setBatchSize] = useState(1);

  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [costSamples, setCostSamples] = useState<CostSample[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [optionLimits, setOptionLimits] = useState<GenerationOptionLimits | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/pricing").then((r) => r.json()),
      fetch("/api/credits/balance").then((r) => r.json()),
      fetch("/api/generate/options").then((r) => r.json()),
      fetch("/api/cost-samples").then((r) => r.json()),
    ])
      .then(([rules, balanceRes, limits, samples]) => {
        setPricingRules(rules);
        setBalance(balanceRes.creditBalance);
        setOptionLimits(isGenerationOptionLimits(limits) ? limits : null);
        setCostSamples(Array.isArray(samples) ? samples : []);
      })
      .finally(() => setPricingLoading(false));
  }, []);

  const allowedResolutions = useMemo(
    () => RESOLUTIONS.filter((r) => optionLimits?.allowedResolutions.includes(r) ?? true),
    [optionLimits]
  );
  // 許可設定の取得前・取得失敗時はSeedanceの上下限を仮に使う(送信時はサーバー側で再検証される)
  const durationMin = optionLimits?.minDurationSeconds ?? DURATION_MIN_SECONDS;
  const durationMax = optionLimits?.maxDurationSeconds ?? DURATION_MAX_SECONDS;
  const durationFixed = durationMin >= durationMax;
  // スライダーの選択済み部分の塗り(0〜100%)。範囲が1点しかない場合は全塗りにする。
  const durationFillPercent = durationFixed
    ? 100
    : ((durationSeconds - durationMin) / (durationMax - durationMin)) * 100;
  const allowedAspectRatios = useMemo(
    () => ASPECT_RATIOS.filter((a) => optionLimits?.allowedAspectRatios.includes(a) ?? true),
    [optionLimits]
  );
  const allowedModes = useMemo(
    () => GENERATION_MODES.filter((m) => optionLimits?.allowedGenerationModes.includes(m) ?? true),
    [optionLimits]
  );

  // 許可設定のロード後、選択中の値が対象外なら許可された先頭の値に補正する
  useEffect(() => {
    if (!optionLimits) return;
    if (allowedResolutions.length > 0 && !allowedResolutions.includes(resolution)) {
      setResolution(allowedResolutions[0]);
    }
    // 動画長は離散選択ではないため、許可範囲外なら最も近い端へ寄せる
    const clamped = clampDurationSeconds(durationSeconds, durationMin, durationMax);
    if (clamped !== durationSeconds) {
      setDurationSeconds(clamped);
    }
    if (allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(allowedAspectRatios[0]);
    }
    // 「引用」プリフィルで許可外モードが選ばれた場合もここで許可された先頭モードへ戻す
    if (allowedModes.length > 0 && !allowedModes.includes(mode)) {
      setMode(allowedModes[0]);
    }
  }, [optionLimits, allowedResolutions, durationMin, durationMax, allowedAspectRatios, allowedModes, resolution, durationSeconds, aspectRatio, mode]);

  // リロード後も直近の生成状況(生成中/生成済み)を表示するため、初回マウント時に直近ジョブを読み込む
  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data: { items?: JobStatus[] }) => {
        const recent = (data.items ?? []).slice(0, RECENT_JOBS_LIMIT);
        if (recent.length === 0) return;
        setJobs((prev) => (prev.length > 0 ? prev : recent));
      });
  }, []);

  // 「引用」導線: 過去ジョブの設定をプリフィルする
  useEffect(() => {
    if (!fromJobId) return;
    fetch(`/api/jobs/${fromJobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (!job) return;
        setPrompt(job.prompt ?? "");
        setResolution(job.resolution ?? "720p");
        setDurationSeconds(job.durationSeconds ?? DEFAULT_DURATION_SECONDS);
        setGenerateAudio(job.generateAudio ?? true);

        // 先頭フレーム画像の有無で生成モードを一意に判定できる
        const isImageMode = Boolean(job.firstFrameImageKey);
        setMode(isImageMode ? "image" : "reference");

        if (isImageMode) {
          // 画像モードのDB上のaspectRatioは "adaptive" で ASPECT_RATIOS に存在しないため復元しない
          setFirstFrameImages(
            job.firstFrameImageUrl
              ? [{ key: job.firstFrameImageKey, previewUrl: job.firstFrameImageUrl }]
              : []
          );
          setEndFrameImages(
            job.endFrameImageKey && job.endFrameImageUrl
              ? [{ key: job.endFrameImageKey, previewUrl: job.endFrameImageUrl }]
              : []
          );
          return;
        }

        setAspectRatio(job.aspectRatio ?? "16:9");
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
      });
  }, [fromJobId]);

  const isImageMode = mode === "image";
  const firstFrame = firstFrameImages[0] ?? null;
  const endFrame = endFrameImages[0] ?? null;
  const hasVideoInput = !isImageMode && referenceVideos.length > 0;
  // 画像モードは先頭フレーム画像だけが必須。プロンプトは公式にoptionalなので空でも送信できる
  const inputReady = isImageMode ? firstFrame !== null : prompt.length > 0;

  const costPerVideo = useMemo(() => {
    const rule = pricingRules.find(
      (r) => r.resolution === resolution && r.hasVideoInput === hasVideoInput
    );
    if (!rule) return null;
    return Math.ceil(durationSeconds * rule.creditPerSecond);
  }, [pricingRules, resolution, durationSeconds, hasVideoInput]);

  const totalCost = costPerVideo !== null ? costPerVideo * batchSize : null;
  const insufficient = totalCost !== null && balance !== null && totalCost > balance;

  // 画像モードには @image1 で参照できる素材が無いのでメンション候補も出さない
  const mentionCandidates = useMemo(
    () =>
      isImageMode
        ? []
        : [
            ...referenceImages.map((img, i) => ({
              tag: referenceImageTag(i),
              previewUrl: img.previewUrl,
            })),
            ...referenceVideos.map((v, i) => ({
              tag: referenceVideoTag(i),
              previewUrl: v.previewUrl,
            })),
          ],
    [isImageMode, referenceImages, referenceVideos]
  );

  const apiCostEstimateJpy = useMemo(() => {
    const perVideo =
      estimateCostJpy(costSamples, {
        resolution,
        aspectRatio: isImageMode ? ADAPTIVE_ASPECT_RATIO : aspectRatio,
        durationSeconds,
        hasReferenceImages: !isImageMode && referenceImages.length > 0,
        hasFirstFrame: isImageMode && firstFrame !== null,
        hasEndFrame: isImageMode && endFrame !== null,
      }) ?? estimateSeedanceCostJpy(resolution, durationSeconds);
    return perVideo === null ? null : perVideo * batchSize;
  }, [
    costSamples,
    resolution,
    aspectRatio,
    durationSeconds,
    isImageMode,
    referenceImages.length,
    firstFrame,
    endFrame,
    batchSize,
  ]);

  // 実行中ジョブのステータスをポーリングする
  useEffect(() => {
    const activeJobIds = jobs.filter((j) => !TERMINAL_STATUSES.has(j.status)).map((j) => j.id);
    if (activeJobIds.length === 0) return;

    const timer = setInterval(async () => {
      const updated = await Promise.all(
        activeJobIds.map((id) => fetch(`/api/jobs/${id}`).then((r) => r.json()))
      );
      setJobs((prev) =>
        prev.map((j) => updated.find((u) => u.id === j.id) ?? j)
      );
      // 残高は消費/返還で変動するので合わせて更新する
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((res) => setBalance(res.creditBalance));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [jobs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const common = { prompt, resolution, durationSeconds, generateAudio, batchSize };
      // モードごとに排他な項目だけを送る(混在するとサーバー側で400になる)
      const payload = isImageMode
        ? {
            mode,
            ...common,
            firstFrameImageKey: firstFrame?.key,
            endFrameImageKey: endFrame?.key,
          }
        : {
            mode,
            ...common,
            referenceImageKeys: referenceImages.map((img) => img.key),
            referenceVideoKeys: referenceVideos.map((v) => v.key),
            aspectRatio,
          };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "生成の開始に失敗しました");
        return;
      }
      setJobs(
        (data.jobIds as string[]).map((id) => ({ id, status: "PENDING" as const }))
      );
      // キュー発行時点でサーバー側は即座に残高を減算するため、ポーリングを待たず表示を更新する
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((res) => setBalance(res.creditBalance));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold">動画生成</h1>

      {/* 管理画面で1モードしか許可されていない場合、切り替え先が無いのでタブではなくモード名だけ示す */}
      {allowedModes.length > 1 ? (
        <div
          role="tablist"
          aria-label="生成モード"
          className="mt-6 inline-flex rounded-md border border-neutral-800 bg-neutral-900 p-1"
        >
          {allowedModes.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                mode === value
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {GENERATION_MODE_LABELS[value]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-neutral-400">{GENERATION_MODE_LABELS[mode]}</p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {isImageMode ? (
          <>
            <ImageUploadField
              images={firstFrameImages}
              onChange={setFirstFrameImages}
              label="先頭フレーム画像"
              maxImages={1}
              showTag={false}
            />
            <ImageUploadField
              images={endFrameImages}
              onChange={setEndFrameImages}
              label="末尾フレーム画像 (任意)"
              maxImages={1}
              showTag={false}
            />
          </>
        ) : (
          <>
            <ImageUploadField images={referenceImages} onChange={setReferenceImages} />
            <VideoUploadField videos={referenceVideos} onChange={setReferenceVideos} />
          </>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            プロンプト{isImageMode && <span className="text-neutral-500"> (任意)</span>}
          </label>
          <MentionTextarea
            value={prompt}
            onChange={setPrompt}
            candidates={mentionCandidates}
            maxLength={5000}
            rows={4}
            placeholder={
              isImageMode
                ? "画像をどう動かしたいかを入力してください(未入力でも生成できます)"
                : "生成したい動画の内容を入力してください( @ で参照画像を指定できます)"
            }
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-neutral-500">{prompt.length}/5000</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">解像度</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as typeof resolution)}
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
            <label className="mb-2 block text-sm font-medium text-neutral-300">アスペクト比</label>
            {isImageMode ? (
              // Seedance 2.5は先頭フレーム画像のアスペクト比を自動継承し ratio は adaptive 固定。
              // 2カラムグリッドはスマートフォン幅でも維持されるため、折り返して隣のselectと
              // 高さがずれないよう短い文言にし、説明はグリッド下の補助行に置く。
              <p className="rounded-md border border-dashed border-neutral-800 px-3 py-2 text-sm text-neutral-500">
                自動
              </p>
            ) : (
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
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

        {/* 動画長は1秒刻み。選択肢が最大27個になりselectでは扱いづらいためスライダーにする */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="duration-slider" className="text-sm font-medium text-neutral-300">
              長さ
            </label>
            <span className="text-sm font-medium tabular-nums text-neutral-100">
              {durationSeconds}秒{durationFixed && "(固定)"}
            </span>
          </div>
          <input
            id="duration-slider"
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

        {isImageMode && (
          <p className="-mt-4 text-xs text-neutral-500">
            アスペクト比は先頭フレーム画像のアスペクト比に追従します
          </p>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <input
              type="checkbox"
              checked={generateAudio}
              onChange={(e) => setGenerateAudio(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
            />
            音声生成
          </label>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            一括生成数 <span className="text-neutral-500">(最大10)</span>
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={batchSize}
            onChange={(e) =>
              setBatchSize(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <CostEstimate
          cost={totalCost}
          costPerVideo={costPerVideo}
          batchSize={batchSize}
          balance={balance}
          apiCostEstimateJpy={apiCostEstimateJpy}
        />

        {submitError && (
          <p className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !inputReady || insufficient || pricingLoading}
          className="w-full rounded-md bg-neutral-100 py-3 text-sm font-semibold text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {insufficient ? "クレジット残高が不足しています" : submitting ? "送信中..." : "生成"}
        </button>
      </form>

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
