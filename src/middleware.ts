import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

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
  }
);

export const config = {
  matcher: [
    "/((?!login|impersonate|api/auth|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
