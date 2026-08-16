import type { NextAuthOptions } from "next-auth";
import { impersonateProvider } from "./auth/impersonate-provider";
import { jwtCallback, sessionCallback } from "./auth/callbacks";
import { impersonateCookies, isSecureCookieContext } from "./auth/cookies";

const SESSION_MAX_AGE_SECONDS = Number(
  process.env.IMPERSONATION_SESSION_MAXAGE_SECONDS ?? 3600
);

// 管理者の「別窓でログイン」用に、通常セッションとは別名のCookieを発行する専用ハンドラ。
// 同一ブラウザで通常セッション(next-auth.session-token)を上書きしないための分離。
export const impersonateAuthOptions: NextAuthOptions = {
  providers: [impersonateProvider],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  cookies: impersonateCookies(isSecureCookieContext()),
  pages: {
    signIn: "/impersonate",
  },
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
};
