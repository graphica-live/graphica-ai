import crypto from "crypto";
import type { NextAuthOptions, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

// process.env.ADMIN_EMAILはNext.jsのビルド時(ページデータ収集)にはまだ
// 注入されていない環境で評価されることがあるため、トップレベルで即時評価せず
// リクエスト処理時に遅延評価する。
function getAdminEmail() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("ADMIN_EMAIL is not set");
  return email.toLowerCase();
}

// 管理者がスタッフとして別窓を開くための、ワンタイム・短命トークンによる代理ログイン。
// トークンは /api/admin/staff/[id]/impersonate でのみ発行される(要管理者権限)。
const impersonateProvider = CredentialsProvider({
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    impersonateProvider,
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      if (email === getAdminEmail()) {
        await prisma.user.upsert({
          where: { email },
          update: { role: "ADMIN" },
          create: { email, name: user.name, image: user.image, role: "ADMIN" },
        });
        return true;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        // 事前登録されていないメールアドレスはログイン不可。
        // PrismaAdapterが本コールバックより先にUserを作成している場合があるため、
        // 直後に作成された孤児Userを削除してから拒否する。
        await prisma.user.deleteMany({ where: { email } });
        return false;
      }
      if (!existing.isActive) return false;

      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      if (account?.provider === "impersonate" && user) {
        token.impersonatedBy = (user as User & { impersonatedBy: string }).impersonatedBy;
      } else if (account?.provider === "google") {
        token.impersonatedBy = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      session.impersonatedBy = token.impersonatedBy;
      return session;
    },
  },
};
