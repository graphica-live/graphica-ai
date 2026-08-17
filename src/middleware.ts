import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { impersonateSessionCookieName } from "@/lib/auth/cookies";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAdminRoute =
      req.nextUrl.pathname.startsWith("/admin") ||
      req.nextUrl.pathname.startsWith("/api/admin");

    if (isAdminRoute && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      // 通常セッション(token)が無くても、代理ログイン専用Cookieがあれば通す。
      // /admin配下の権限判定は上のmiddleware関数がtoken(常に通常Cookie)のみで行う。
      authorized: async ({ req, token }) => {
        if (token) return true;
        const impersonateToken = await getToken({
          req,
          cookieName: impersonateSessionCookieName(),
          secret: process.env.NEXTAUTH_SECRET,
        });
        return !!impersonateToken;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!login|impersonate|api/auth|api/impersonate-auth|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
