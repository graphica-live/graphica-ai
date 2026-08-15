import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!.toLowerCase();

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

      if (email === ADMIN_EMAIL) {
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
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
