import { v4 as uuidv4 } from "uuid";
import type { VideoGenerationProvider } from "./types";

// Dreamina API未接続でも動作確認できるように、実際のバイト取得先として
// 公開されているサンプル動画を返す(egress/保存フローの検証用)。
const SAMPLE_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const SIMULATED_DURATION_MS = 8000;

interface MockJobState {
  startedAt: number;
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

  async submit() {
    const providerJobId = uuidv4();
    jobs.set(providerJobId, { startedAt: Date.now() });
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

    return { status: "completed", videoUrl: SAMPLE_VIDEO_URL };
  },
};
