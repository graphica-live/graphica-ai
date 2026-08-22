import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import {
  getPresignedDownloadUrl,
  getPresignedAttachmentUrl,
} from "@/lib/storage/storage-service";
import { videoDownloadFilename } from "@/lib/jobs/video-naming";

const PAGE_SIZE = 24;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    // ピン止めした生成履歴ページからは pinned=1 で絞り込む
    const pinnedOnly = searchParams.get("pinned") === "1";

    const jobs = await prisma.generationJob.findMany({
      where: {
        userId: user.id,
        ...(pinnedOnly ? { isPinned: true } : {}),
      },
      // ピン一覧も生成日時順にする。ソートキーがピン操作で変化しないため、
      // 一覧を開いたままピンを解除してもcursorページングの境界がずれない。
      // idはタイブレーカー。
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = jobs.length > PAGE_SIZE;
    const pageJobs = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs;

    const items = await Promise.all(
      pageJobs.map(async (job) => ({
        ...job,
        videoUrl: job.videoObjectKey
          ? await getPresignedDownloadUrl(job.videoObjectKey)
          : undefined,
        downloadUrl: job.videoObjectKey
          ? await getPresignedAttachmentUrl(job.videoObjectKey, videoDownloadFilename(job.id))
          : undefined,
        thumbnailUrl: job.thumbnailObjectKey
          ? await getPresignedDownloadUrl(job.thumbnailObjectKey)
          : undefined,
      }))
    );

    return NextResponse.json({
      items,
      nextCursor: hasMore ? pageJobs[pageJobs.length - 1].id : null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
