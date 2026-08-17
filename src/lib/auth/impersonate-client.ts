const BASE_PATH = "/api/impersonate-auth";

async function getCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE_PATH}/csrf`);
  const data = await res.json();
  return data.csrfToken;
}

// next-auth/reactのsignIn/SessionProviderはグローバルなbasePath(既定/api/auth)に依存し
// ページ単位で切り替えられないため、代理ログイン専用エンドポイントをCSRFトークン取得+
// 直接fetchで叩く軽量ラッパー。next-auth内部のCredentials signInフローと同じ手順。
export async function impersonateSignIn(
  token: string,
  callbackUrl = "/"
): Promise<{ url: string }> {
  const csrfToken = await getCsrfToken();
  const res = await fetch(`${BASE_PATH}/callback/impersonate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, csrfToken, callbackUrl, json: "true" }),
  });
  const data = await res.json();
  return { url: data.url ?? callbackUrl };
}

export async function impersonateSignOut(callbackUrl = "/login"): Promise<{ url: string }> {
  const csrfToken = await getCsrfToken();
  const res = await fetch(`${BASE_PATH}/signout`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl, json: "true" }),
  });
  const data = await res.json();
  return { url: data.url ?? callbackUrl };
}
