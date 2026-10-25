export interface MicrosoftSmtpApplication { tenantId: string; clientId: string; clientSecret: string }
export function createMicrosoftSmtpTokenProvider(app: MicrosoftSmtpApplication, fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  let cached: { accessToken: string; expiresAt: number } | undefined;
  let pending: Promise<{ accessToken: string; expiresAt: number }> | undefined;
  return async (renew = false): Promise<{ accessToken: string; expiresAt: number }> => {
    if (!renew && cached && cached.expiresAt > now() + 60000) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetcher(`https://login.microsoftonline.com/${app.tenantId}/oauth2/v2.0/token`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret,
            grant_type: "client_credentials", scope: "https://outlook.office365.com/.default" }),
        });
        if (!response.ok) throw new Error("Token request rejected");
        const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
        if (typeof body.access_token !== "string" || !body.access_token
          || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in)
          || body.expires_in <= 60 || body.expires_in > 86400) throw new Error("Invalid token response");
        cached = { accessToken: body.access_token, expiresAt: now() + body.expires_in * 1000 };
        return cached;
      } catch {
        throw new Error("MICROSOFT_SMTP_TOKEN_FAILED");
      }
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
