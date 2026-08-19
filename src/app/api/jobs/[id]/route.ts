import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl, deleteObjects } from "@/lib/storage/storage-service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const job = await prisma.generationJob.findUnique({ where: { id: params.id } });

    if (!job || (job.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }

    const videoUrl = job.videoObjectKey
      ? await getPresignedDownloadUrl(job.videoObjectKey)
      : undefined;
    const thumbnailUrl = job.thumbnailObjectKey
      ? await getPresignedDownloadUrl(job.thumbnailObjectKey)
      : undefined;
    const referenceImageUrls = await Promise.all(
      job.referenceImageKeys.map((key) => getPresignedDownloadUrl(key))
    );
    const referenceVideoUrls = await Promise.all(
      job.referenceVideoKeys.map((key) => getPresignedDownloadUrl(key))
    );
    // 「引用」導線で image to video ジョブの入力画像を復元するために返す
    const firstFrameImageUrl = job.firstFrameImageKey
      ? await getPresignedDownloadUrl(job.firstFrameImageKey)
      : undefined;
    const endFrameImageUrl = job.endFrameImageKey
      ? await getPresignedDownloadUrl(job.endFrameImageKey)
      : undefined;

    return NextResponse.json({
      ...job,
      videoUrl,
      thumbnailUrl,
      referenceImageUrls,
      referenceVideoUrls,
      firstFrameImageUrl,
      endFrameImageUrl,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const job = await prisma.generationJob.findUnique({ where: { id: params.id } });

    if (!job || (job.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }

    await deleteObjects([job.videoObjectKey, job.thumbnailObjectKey].filter(
      (k): k is string => Boolean(k)
    ));
    await prisma.generationJob.delete({ where: { id: job.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
