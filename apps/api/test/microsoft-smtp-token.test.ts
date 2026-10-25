import { describe, expect, it } from "vitest";
import { createMicrosoftSmtpTokenProvider } from "../src/modules/quotes/microsoft-smtp-token.js";
import { loadSmtpConfig } from "../src/modules/quotes/smtp-email.js";

const app = { tenantId: "11111111-1111-4111-8111-111111111111", clientId: "22222222-2222-4222-8222-222222222222", clientSecret: "test-secret" };
describe("Microsoft 365 SMTP authentication", () => {
  it("supports scoped application credentials without requiring a mailbox password", () => {
    const config = loadSmtpConfig({ QUOTE_EMAIL_SENDING: "enabled", SMTP_AUTH_MODE: "microsoft-oauth2",
      SMTP_HOST: "smtp.office365.com", SMTP_PORT: "587", SMTP_FROM: "sender@example.test", SMTP_USER: "sender@example.test",
      MICROSOFT_TENANT_ID: app.tenantId, MICROSOFT_CLIENT_ID: app.clientId, MICROSOFT_CLIENT_SECRET: app.clientSecret });
    expect(config?.microsoft).toEqual(app);
  });
  it("requests only the SMTP resource token, reuses it until near expiry, and renews on demand", async () => {
    const requests: Array<{url:string;body:string;redirect:unknown}> = [];
    let now = 1000000;
    const token = createMicrosoftSmtpTokenProvider(app, async (input, init) => {
      requests.push({ url:String(input), body:String(init?.body), redirect:init?.redirect });
      return new Response(JSON.stringify({ access_token: `test-token-${requests.length}`, expires_in: 3600 }), { status:200 });
    }, () => now);
    expect((await token()).accessToken).toBe("test-token-1");
    expect((await token()).accessToken).toBe("test-token-1");
    now += 3590000;
    expect((await token()).accessToken).toBe("test-token-2");
    expect((await token(true)).accessToken).toBe("test-token-3");
    expect(requests).toHaveLength(3);
    expect(requests[0].url).toBe("https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/oauth2/v2.0/token");
    expect(new URLSearchParams(requests[0].body).get("scope")).toBe("https://outlook.office365.com/.default");
    expect(new URLSearchParams(requests[0].body).get("grant_type")).toBe("client_credentials");
    expect(requests[0].redirect).toBe("error");
  });
  it("does not expose Microsoft response errors, credentials or malformed token values", async () => {
    const token = createMicrosoftSmtpTokenProvider(app, async () => new Response("test-secret mailbox-private-detail", {status:401}));
    await expect(token()).rejects.toThrow(/^MICROSOFT_SMTP_TOKEN_FAILED$/);
    const invalid = createMicrosoftSmtpTokenProvider(app, async () => new Response(JSON.stringify({access_token: "", expires_in:3600})));
    await expect(invalid()).rejects.toThrow(/^MICROSOFT_SMTP_TOKEN_FAILED$/);
  });
  it("cannot send Microsoft mailbox tokens to a different SMTP server", () => {
    expect(() => loadSmtpConfig({ QUOTE_EMAIL_SENDING: "enabled", SMTP_AUTH_MODE:"microsoft-oauth2",
      SMTP_HOST:"smtp.other.example", SMTP_PORT:"587", SMTP_FROM:"sender@example.test", SMTP_USER:"sender@example.test",
      MICROSOFT_TENANT_ID:app.tenantId, MICROSOFT_CLIENT_ID:app.clientId, MICROSOFT_CLIENT_SECRET:app.clientSecret,
    })).toThrow("Microsoft SMTP requires smtp.office365.com:587");
  });
});
