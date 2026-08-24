"use client";

import { useCallback, useEffect, useState } from "react";
import type { JobStatus } from "./JobStatusCard";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);
const RECENT_JOBS_LIMIT = 3;

/**
 * 生成フォームが共有する「残高 + 直近ジョブ + ポーリング」。
 *
 * モデルごとにフォームを分けても、生成状況の表示とクレジット残高の更新は同じなので
 * ここへ集約する。リロード後も直近の生成状況を出せるよう、初回マウント時に
 * サーバーから直近ジョブを読み込む(ブラウザを閉じても状態はDB側に残っている)。
 */
export function useGenerationJobs() {
  const [balance, setBalance] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  const refreshBalance = useCallback(() => {
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((res) => setBalance(res.creditBalance))
      .catch(() => {
        /* 残高表示は補助情報なので、取得失敗でフォームを止めない */
      });
  }, []);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data: { items?: JobStatus[] }) => {
        const recent = (data.items ?? []).slice(0, RECENT_JOBS_LIMIT);
        if (recent.length === 0) return;
        setJobs((prev) => (prev.length > 0 ? prev : recent));
      })
      .catch(() => {
        /* 直近ジョブの復元に失敗しても新規生成は行える */
      });
  }, []);

  // 実行中ジョブのステータスをポーリングする
  useEffect(() => {
    const activeJobIds = jobs.filter((j) => !TERMINAL_STATUSES.has(j.status)).map((j) => j.id);
    if (activeJobIds.length === 0) return;

    const timer = setInterval(async () => {
      try {
        const updated = await Promise.all(
          activeJobIds.map((id) => fetch(`/api/jobs/${id}`).then((r) => r.json()))
        );
        setJobs((prev) => prev.map((j) => updated.find((u) => u.id === j.id) ?? j));
      } catch {
        // 一時的な通信エラーでポーリングを止めない。次のtickで再取得する
        return;
      }
      // 残高は消費/返還で変動するので合わせて更新する
      refreshBalance();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [jobs, refreshBalance]);

  return { balance, jobs, setJobs, refreshBalance };
}
