import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

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
      },
    });
    return NextResponse.json(limits);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
