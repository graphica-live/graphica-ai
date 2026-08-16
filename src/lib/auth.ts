import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { jwtCallback, sessionCallback } from "./auth/callbacks";

// process.env.ADMIN_EMAILはNext.jsのビルド時(ページデータ収集)にはまだ
// 注入されていない環境で評価されることがあるため、トップレベルで即時評価せず
// リクエスト処理時に遅延評価する。
function getAdminEmail() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("ADMIN_EMAIL is not set");
  return email.toLowerCase();
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
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
    jwt: jwtCallback,
    session: sessionCallback,
  },
};
