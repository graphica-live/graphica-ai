"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";
import { VideoUploadField, type UploadedVideo } from "./VideoUploadField";
import { MentionTextarea } from "./MentionTextarea";
import { CostEstimate } from "./CostEstimate";
import { JobStatusCard, type JobStatus } from "./JobStatusCard";
import { estimateSeedanceCostJpy } from "@/lib/credits/seedance-cost-estimate";
import { estimateCostJpy, type CostSample } from "@/lib/credits/empirical-cost-estimate";
import { RESOLUTIONS, DURATIONS, ASPECT_RATIOS } from "@/lib/generation/options";
import { referenceImageTag, referenceVideoTag } from "@/lib/generation/mention";

interface GenerationOptionLimits {
  allowedResolutions: string[];
  allowedDurations: number[];
  allowedAspectRatios: string[];
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

  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<UploadedVideo[]>([]);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [durationSeconds, setDurationSeconds] = useState<(typeof DURATIONS)[number]>(5);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("16:9");
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
        setOptionLimits(limits);
        setCostSamples(Array.isArray(samples) ? samples : []);
      })
      .finally(() => setPricingLoading(false));
  }, []);

  const allowedResolutions = useMemo(
    () => RESOLUTIONS.filter((r) => optionLimits?.allowedResolutions.includes(r) ?? true),
    [optionLimits]
  );
  const allowedDurations = useMemo(
    () => DURATIONS.filter((d) => optionLimits?.allowedDurations.includes(d) ?? true),
    [optionLimits]
  );
  const allowedAspectRatios = useMemo(
    () => ASPECT_RATIOS.filter((a) => optionLimits?.allowedAspectRatios.includes(a) ?? true),
    [optionLimits]
  );

  // 許可設定のロード後、選択中の値が対象外なら許可された先頭の値に補正する
  useEffect(() => {
    if (!optionLimits) return;
    if (allowedResolutions.length > 0 && !allowedResolutions.includes(resolution)) {
      setResolution(allowedResolutions[0]);
    }
    if (allowedDurations.length > 0 && !allowedDurations.includes(durationSeconds)) {
      setDurationSeconds(allowedDurations[0]);
    }
    if (allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(allowedAspectRatios[0]);
    }
  }, [optionLimits, allowedResolutions, allowedDurations, allowedAspectRatios, resolution, durationSeconds, aspectRatio]);

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
        setDurationSeconds(job.durationSeconds ?? 5);
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

  const hasVideoInput = referenceVideos.length > 0;

  const costPerVideo = useMemo(() => {
    const rule = pricingRules.find(
      (r) => r.resolution === resolution && r.hasVideoInput === hasVideoInput
    );
    if (!rule) return null;
    return Math.ceil(durationSeconds * rule.creditPerSecond);
  }, [pricingRules, resolution, durationSeconds, hasVideoInput]);

  const totalCost = costPerVideo !== null ? costPerVideo * batchSize : null;
  const insufficient = totalCost !== null && balance !== null && totalCost > balance;

  const mentionCandidates = useMemo(
    () => [
      ...referenceImages.map((img, i) => ({
        tag: referenceImageTag(i),
        previewUrl: img.previewUrl,
      })),
      ...referenceVideos.map((v, i) => ({
        tag: referenceVideoTag(i),
        previewUrl: v.previewUrl,
      })),
    ],
    [referenceImages, referenceVideos]
  );

  const apiCostEstimateJpy = useMemo(() => {
    const perVideo =
      estimateCostJpy(costSamples, {
        resolution,
        aspectRatio,
        durationSeconds,
        hasReferenceImages: referenceImages.length > 0,
        hasEndFrame: false,
      }) ?? estimateSeedanceCostJpy(resolution, durationSeconds);
    return perVideo === null ? null : perVideo * batchSize;
  }, [costSamples, resolution, aspectRatio, durationSeconds, referenceImages.length, batchSize]);

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
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          referenceImageKeys: referenceImages.map((img) => img.key),
          referenceVideoKeys: referenceVideos.map((v) => v.key),
          resolution,
          durationSeconds,
          aspectRatio,
          batchSize,
        }),
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <ImageUploadField images={referenceImages} onChange={setReferenceImages} />

        <VideoUploadField videos={referenceVideos} onChange={setReferenceVideos} />

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">プロンプト</label>
          <MentionTextarea
            value={prompt}
            onChange={setPrompt}
            candidates={mentionCandidates}
            maxLength={5000}
            rows={4}
            placeholder="生成したい動画の内容を入力してください( @ で参照画像を指定できます)"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-neutral-500">{prompt.length}/5000</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
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
            <label className="mb-2 block text-sm font-medium text-neutral-300">長さ(秒)</label>
            <select
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value) as typeof durationSeconds)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              {allowedDurations.map((d) => (
                <option key={d} value={d}>
                  {d}秒
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">アスペクト比</label>
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
          </div>
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
          disabled={submitting || !prompt || insufficient || pricingLoading}
          className="w-full rounded-md bg-neutral-100 py-3 text-sm font-semibold text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {insufficient ? "クレジット残高が不足しています" : submitting ? "送信中..." : "生成"}
        </button>
      </form>

      {jobs.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-sm font-medium text-neutral-300">生成状況</h2>
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
