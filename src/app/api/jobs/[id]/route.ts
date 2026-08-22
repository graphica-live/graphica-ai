import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl, deleteObjects } from "@/lib/storage/storage-service";

const patchSchema = z.object({
  pinned: z.boolean(),
});

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

// ピン止め(お気に入り)のトグル。
// GET/DELETEと違いADMINの代理操作は許可しない。ピン止めは利用者本人のブックマークであり、
// 他人のジョブをピンしても本人の一覧には現れないため。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    let parsed: z.infer<typeof patchSchema>;
    try {
      parsed = patchSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
    }

    // 所有者チェックをWHEREに含め、チェックと更新の間で所有者が変わる余地をなくす。
    // 同じ値でのPATCH再送は結果が変わらない(冪等)。
    const result = await prisma.generationJob.updateMany({
      where: { id: params.id, userId: user.id },
      data: { isPinned: parsed.pinned },
    });

    // 非所有者・不存在・DELETE済みはいずれも404
    if (result.count === 0) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ id: params.id, isPinned: parsed.pinned });
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
