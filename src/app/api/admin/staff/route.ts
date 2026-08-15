import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!.toLowerCase();

const createStaffSchema = z.object({
  email: z.string().email(),
});

export async function GET() {
  try {
    await requireAdmin();
    const staff = await prisma.user.findMany({
      where: { role: "STAFF" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(staff);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = createStaffSchema.parse(await req.json());
    const email = body.email.toLowerCase();

    if (email === ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "このメールアドレスは管理者用に予約されています" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 409 }
      );
    }

    const staff = await prisma.user.create({
      data: { email, role: "STAFF" },
    });
    return NextResponse.json(staff, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
}
