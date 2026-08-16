import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { impersonateAuthOptions } from "@/lib/auth-impersonate";

// 代理ログイン専用Cookieが存在すればそちらを優先し、無ければ通常セッションにフォールバックする。
// 注意: Cookieはブラウザ単位で共有されるため、同一ブラウザの別タブでも代理ログインCookieが
// 存在する限りこちらが優先される。/admin配下は必ず getServerSession(authOptions) を直接使うこと。
export async function getEffectiveSession(): Promise<Session | null> {
  const impersonated = await getServerSession(impersonateAuthOptions);
  if (impersonated?.user) return impersonated;
  return getServerSession(authOptions);
}
