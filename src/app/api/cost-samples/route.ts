import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import type { CostSample } from "@/lib/credits/empirical-cost-estimate";

export async function GET() {
  try {
    await requireUser();
    const jobs = await prisma.generationJob.findMany({
      where: { status: "COMPLETED", actualTotalTokens: { not: null } },
      select: {
        resolution: true,
        aspectRatio: true,
        durationSeconds: true,
        referenceImageKeys: true,
        endFrameImageKey: true,
        actualTotalTokens: true,
      },
    });

    const groups = new Map<string, { sum: number; count: number; sample: CostSample }>();
    for (const job of jobs) {
      if (!job.actualTotalTokens || job.durationSeconds <= 0) continue;
      const hasReferenceImages = job.referenceImageKeys.length > 0;
      const hasEndFrame = job.endFrameImageKey != null;
      const key = `${job.resolution}|${job.aspectRatio}|${hasReferenceImages}|${hasEndFrame}`;
      const tokensPerSecond = job.actualTotalTokens / job.durationSeconds;

      const existing = groups.get(key);
      if (existing) {
        existing.sum += tokensPerSecond;
        existing.count += 1;
      } else {
        groups.set(key, {
          sum: tokensPerSecond,
          count: 1,
          sample: {
            resolution: job.resolution,
            aspectRatio: job.aspectRatio,
            hasReferenceImages,
            hasEndFrame,
            avgTokensPerSecond: 0,
            sampleCount: 0,
          },
        });
      }
    }

    const samples: CostSample[] = Array.from(groups.values()).map((g) => ({
      ...g.sample,
      avgTokensPerSecond: g.sum / g.count,
      sampleCount: g.count,
    }));

    return NextResponse.json(samples);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
