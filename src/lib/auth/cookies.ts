import type { NextAuthOptions } from "next-auth";

const IMPERSONATE_COOKIE_BASE = "impersonate-auth";

// next-authコア(next-auth/core/init)のuseSecureCookies判定を再現する。
// NODE_ENVではなくNEXTAUTH_URLがhttps://始まりかどうかで決まる。
// (関数名を"use"始まりにするとESLintがReact Hookと誤認識するため避けている)
export function isSecureCookieContext(): boolean {
  return (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
}

// next-authのcookiesオプションはトップレベルキー単位のシャローマージのため、
// sessionTokenだけでなくcallbackUrl/csrfTokenも専用名にしないと通常セッションと衝突する。
export function impersonateCookies(secure = isSecureCookieContext()): NonNullable<NextAuthOptions["cookies"]> {
  const securePrefix = secure ? "__Secure-" : "";
  const hostPrefix = secure ? "__Host-" : "";
  return {
    sessionToken: {
      name: `${securePrefix}${IMPERSONATE_COOKIE_BASE}.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure },
    },
    callbackUrl: {
      name: `${securePrefix}${IMPERSONATE_COOKIE_BASE}.callback-url`,
      options: { sameSite: "lax", path: "/", secure },
    },
    csrfToken: {
      name: `${hostPrefix}${IMPERSONATE_COOKIE_BASE}.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure },
    },
  };
}

export function impersonateSessionCookieName(secure = isSecureCookieContext()): string {
  return impersonateCookies(secure).sessionToken!.name;
}
