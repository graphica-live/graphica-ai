import type { NextAuthOptions, User } from "next-auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Callbacks = NonNullable<NextAuthOptions["callbacks"]>;
type JwtCallback = NonNullable<Callbacks["jwt"]>;
type SessionCallback = NonNullable<Callbacks["session"]>;

export const jwtCallback: JwtCallback = async ({ token, user, account }) => {
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
};

export const sessionCallback: SessionCallback = async ({ session, token }) => {
  if (session.user) {
    session.user.id = token.id as string;
    session.user.role = token.role as Role;
  }
  session.impersonatedBy = token.impersonatedBy;
  return session;
};
