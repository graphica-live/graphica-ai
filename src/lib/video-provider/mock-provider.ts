import { v4 as uuidv4 } from "uuid";
import type { ProviderUsage, VideoGenerationProvider } from "./types";
import type { ProviderName } from "@/lib/generation/models";
import { estimateTokens } from "@/lib/credits/cost";

// 実APIへ接続できない環境でも動作確認できるように、実際のバイト取得先として
// 公開されているサンプル動画を返す(egress/保存フローの検証用)。
const SAMPLE_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const SIMULATED_DURATION_MS = 8000;

interface MockJobState {
  provider: ProviderName;
  startedAt: number;
  resolution: string;
  durationSeconds: number;
  referenceImageCount: number;
  hasReferenceVideo: boolean;
}

// Next.jsはAPI Routeとinstrumentation(poller)を別バンドルとしてコンパイルするため、
// モジュールスコープの変数だとバンドルごとに別インスタンスになり状態が共有されない。
// prisma.tsと同じくglobalThisに保持してプロセス内で確実に共有する。
const globalForMockJobs = globalThis as unknown as {
  __mockProviderJobs?: Map<string, MockJobState>;
};
const jobs = globalForMockJobs.__mockProviderJobs ?? new Map<string, MockJobState>();
globalForMockJobs.__mockProviderJobs = jobs;

/**
 * 完了時の差額精算をmockでも検証できるよう、そのプロバイダの課金単位に合わせた
 * usage を合成する。プロバイダごとに形を変えるのは、片方の形しか返さないmockだと
 * 「実際には報告されないフィールドを課金経路が参照している」バグを取り逃すため。
 */
function mockUsage(job: MockJobState): ProviderUsage | undefined {
  if (job.provider === "minimax") {
    return {
      outputSeconds: job.durationSeconds,
      // 参照動画の実尺はmockでは分からないため、与信と同じ最大値を返して
      // 「満額仮押さえ → 実績で精算」の経路が動くことだけを確認する。
      inputSeconds: job.hasReferenceVideo ? job.durationSeconds : 0,
      inputImageCount: job.referenceImageCount,
    };
  }
  // Seedance: 数式ベースの概算トークン数を実測値の代わりに返す。
  // 未知の解像度ではトークン数を報告せず、仮押さえ額のまま確定する経路を再現する。
  try {
    const tokens = estimateTokens(job.resolution, job.durationSeconds);
    return { completionTokens: tokens, totalTokens: tokens };
  } catch {
    return undefined;
  }
}

export function createMockProvider(provider: ProviderName): VideoGenerationProvider {
  return {
    name: `mock:${provider}`,

    async submit(req) {
      const providerJobId = uuidv4();
      jobs.set(providerJobId, {
        provider,
        startedAt: Date.now(),
        resolution: req.resolution,
        durationSeconds: req.durationSeconds,
        referenceImageCount: req.referenceImages.length,
        hasReferenceVideo: req.referenceVideos.length > 0,
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

      return {
        status: "completed",
        videoUrl: SAMPLE_VIDEO_URL,
        usage: mockUsage(job),
      };
    },
  };
}
