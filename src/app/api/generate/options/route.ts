import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { isMiniMaxAvailable } from "@/lib/video-provider";

export async function GET() {
  try {
    const user = await requireUser();
    const limits = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        allowedResolutions: true,
        minDurationSeconds: true,
        maxDurationSeconds: true,
        allowedAspectRatios: true,
        allowedGenerationModes: true,
        allowedModels: true,
      },
    });

    // 本番でAPIキーが未設定のうちはH3を選択肢から外す。mockへフォールバックさせると
    // 設定漏れがサンプル動画として成功してしまい検知できない。
    const allowedModels = isMiniMaxAvailable()
      ? limits.allowedModels
      : limits.allowedModels.filter((m) => m !== "minimax-h3");

    return NextResponse.json({ ...limits, allowedModels });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
