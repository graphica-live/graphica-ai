import { v4 as uuidv4 } from "uuid";
import type { VideoGenerationProvider } from "./types";
import { estimateTokens } from "@/lib/credits/cost";

// Dreamina API未接続でも動作確認できるように、実際のバイト取得先として
// 公開されているサンプル動画を返す(egress/保存フローの検証用)。
const SAMPLE_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const SIMULATED_DURATION_MS = 8000;

interface MockJobState {
  startedAt: number;
  resolution: string;
  durationSeconds: number;
}

// Next.jsはAPI Routeとinstrumentation(poller)を別バンドルとしてコンパイルするため、
// モジュールスコープの変数だとバンドルごとに別インスタンスになり状態が共有されない。
// prisma.tsと同じくglobalThisに保持してプロセス内で確実に共有する。
const globalForMockJobs = globalThis as unknown as {
  __mockProviderJobs?: Map<string, MockJobState>;
};
const jobs = globalForMockJobs.__mockProviderJobs ?? new Map<string, MockJobState>();
globalForMockJobs.__mockProviderJobs = jobs;

export const mockProvider: VideoGenerationProvider = {
  name: "mock",

  async submit(req) {
    const providerJobId = uuidv4();
    jobs.set(providerJobId, {
      startedAt: Date.now(),
      resolution: req.resolution,
      durationSeconds: req.durationSeconds,
    });
    return { providerJobId };
  },

  async getStatus(providerJobId) {
    const job = jobs.get(providerJobId);
    if (!job) {
      return { status: "failed", errorMessage: "存在しないジョブです(mock provider)" };
    }

    const elapsed = Date.now() - job.startedAt;
    if (elapsed < SIMULATED_DURATION_MS) {
      return {
        status: "processing",
        progress: Math.min(99, Math.round((elapsed / SIMULATED_DURATION_MS) * 100)),
      };
    }

    // 完了時の差額精算をmockでも検証できるよう、数式ベースの概算トークン数を
    // 実測値の代わりに返す。未知の解像度ではトークン数を報告せず、
    // 仮押さえ額のまま確定する経路(usage未報告)を再現する。
    let tokens: number | null = null;
    try {
      tokens = estimateTokens(job.resolution, job.durationSeconds);
    } catch {
      tokens = null;
    }
    return {
      status: "completed",
      videoUrl: SAMPLE_VIDEO_URL,
      usage: tokens !== null ? { completionTokens: tokens, totalTokens: tokens } : undefined,
    };
  },
};
