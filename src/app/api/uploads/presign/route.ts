import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { getPresignedUploadUrl } from "@/lib/storage/storage-service";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif",
  "video/mp4",
];

const requestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES as [string, ...string[]]),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await req.json());

    const key = `uploads/${user.id}/${uuidv4()}-${body.filename}`;
    const uploadUrl = await getPresignedUploadUrl(key, body.contentType);

    return NextResponse.json({ key, uploadUrl });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
