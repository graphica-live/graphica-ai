import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("ログインが必要です");
  if (session.user.role !== "ADMIN") throw new ForbiddenError("管理者権限が必要です");
  return session.user;
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("ログインが必要です");
  return { ...session.user, impersonatedBy: session.impersonatedBy };
}
