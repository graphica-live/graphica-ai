import crypto from "crypto";
import CredentialsProvider from "next-auth/providers/credentials";
import type { User } from "next-auth";
import { prisma } from "@/lib/prisma";

// 管理者がスタッフとして別窓を開くための、ワンタイム・短命トークンによる代理ログイン。
// トークンは /api/admin/staff/[id]/impersonate でのみ発行される(要管理者権限)。
export const impersonateProvider = CredentialsProvider({
  id: "impersonate",
  name: "Impersonate",
  credentials: { token: { label: "Token", type: "text" } },
  async authorize(credentials) {
    const token = credentials?.token;
    if (!token) return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const impersonation = await prisma.impersonation.findUnique({ where: { tokenHash } });
    if (!impersonation || impersonation.usedAt || impersonation.expiresAt < new Date()) {
      return null;
    }

    // 同時使用による二重ログインを防ぐため、まだ未使用の場合のみ原子的に使用済みにする。
    const claimed = await prisma.impersonation.updateMany({
      where: { id: impersonation.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    const staff = await prisma.user.findUnique({ where: { id: impersonation.staffUserId } });
    if (!staff || !staff.isActive) return null;

    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      image: staff.image,
      impersonatedBy: impersonation.issuedByUserId,
    } as User & { impersonatedBy: string };
  },
});
