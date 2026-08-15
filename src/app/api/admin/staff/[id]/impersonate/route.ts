import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

const TTL_SECONDS = Number(process.env.IMPERSONATION_TOKEN_TTL_SECONDS ?? 120);

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();

    const staff = await prisma.user.findUnique({ where: { id: params.id } });
    if (!staff || staff.role !== "STAFF") {
      return NextResponse.json({ error: "スタッフが見つかりません" }, { status: 404 });
    }
    if (!staff.isActive) {
      return NextResponse.json({ error: "無効化されたスタッフです" }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await prisma.impersonation.create({
      data: {
        tokenHash,
        staffUserId: staff.id,
        issuedByUserId: admin.id,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
      },
    });

    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
