import NextAuth from "next-auth";
import { impersonateAuthOptions } from "@/lib/auth-impersonate";

const handler = NextAuth(impersonateAuthOptions);

export { handler as GET, handler as POST };
