import { afterEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { createServer, type Socket } from "node:net";
import { createSmtpQuoteEmailPort, loadSmtpConfig } from "../src/modules/quotes/smtp-email.js";
import type { QuoteEmailMessage } from "../src/modules/quotes/email-delivery.js";

const env = {
  QUOTE_EMAIL_SENDING: "enabled", SMTP_HOST: "smtp.example.test", SMTP_PORT: "587",
  SMTP_USER: "mailer", SMTP_PASSWORD: "never-log-this", SMTP_FROM: "quotes@example.test",
};
const message: QuoteEmailMessage = {
  kind: "quote.notified", to: ["customer@example.test"], subject: "Your quote RD-00001 is ready",
  body: "Sign in to review your quote.", providerIdempotencyKey: "event-1", payload: {},
};
afterEach(() => vi.restoreAllMocks());

describe("SMTP mail configuration", () => {
  it("stays disabled without an explicit sending switch", () => {
    expect(loadSmtpConfig({})).toBeNull();
  });
  it("rejects missing credentials and unsafe sender headers without leaking secrets", () => {
    expect(() => loadSmtpConfig({ ...env, SMTP_PASSWORD: "" })).toThrow("SMTP_PASSWORD");
    expect(() => loadSmtpConfig({ ...env, SMTP_FROM: "quotes@example.test\r\nBcc: other@example.test" })).toThrow("SMTP_FROM");
  });
});

describe("SMTP acceptance", () => {
  it("sends the configured sender and only the intended recipients, with a stable message ID", async () => {
    // A real Nodemailer stream composes MIME without contacting an external server.
    const mime = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const sent: Array<{ envelope: unknown; source: string }> = [];
    const port = createSmtpQuoteEmailPort(loadSmtpConfig(env)!, {
      async sendMail(mail) {
        const result = await mime.sendMail(mail);
        sent.push({ envelope: result.envelope, source: result.message.toString() });
        return { accepted: result.envelope.to, rejected: [] };
      },
    });
    await port.deliver(message);
    await port.deliver(message);
    expect(sent[0].envelope).toEqual({ from: "quotes@example.test", to: ["customer@example.test"] });
    expect(sent[0].source).toContain("Subject: Your quote RD-00001 is ready");
    expect(sent[0].source).toContain("Sign in to review your quote.");
    expect(sent[0].source).not.toContain("never-log-this");
    expect(sent[0].source.match(/^Message-ID: (.+)$/m)?.[1]).toBe(sent[1].source.match(/^Message-ID: (.+)$/m)?.[1]);
  });

  it("does not treat partial recipient acceptance as success", async () => {
    const port = createSmtpQuoteEmailPort(loadSmtpConfig(env)!, {
      async sendMail() { return { accepted: ["customer@example.test"], rejected: ["second@example.test"] }; },
    });
    await expect(port.deliver({ ...message, to: [...message.to, "second@example.test"] })).rejects.toThrow("SMTP_RECIPIENT_REJECTED");
  });

  it("rejects an empty or malformed recipient before the transport is called", async () => {
    let attempts = 0;
    const port = createSmtpQuoteEmailPort(loadSmtpConfig(env)!, {
      async sendMail() { attempts++; return { accepted: [], rejected: [] }; },
    });
    await expect(port.deliver({ ...message, to: [] })).rejects.toThrow("SMTP_RECIPIENT_INVALID");
    await expect(port.deliver({ ...message, to: ["a@example.test, secret@example.test"] })).rejects.toThrow("SMTP_RECIPIENT_INVALID");
    expect(attempts).toBe(0);
  });

  it("rejects mailbox syntax that the provider parser could reinterpret before sending", async () => {
    let attempts = 0;
    const port = createSmtpQuoteEmailPort(loadSmtpConfig(env)!, {
      async sendMail() { attempts++; return { accepted: [], rejected: [] }; },
    });
    for (const address of ["a(b)@example.test", '"a"@example.test', "a\\b@example.test", "a..b@example.test"]) {
      await expect(port.deliver({ ...message, to: [address] })).rejects.toThrow("SMTP_RECIPIENT_INVALID");
      expect(() => loadSmtpConfig({ ...env, SMTP_FROM: address })).toThrow("SMTP_FROM");
      expect(() => loadSmtpConfig({ ...env, SMTP_REPLY_TO: address })).toThrow("SMTP_REPLY_TO");
    }
    expect(attempts).toBe(0);
  });

  it("redacts provider failures rather than exposing credentials or message content", async () => {
    const port = createSmtpQuoteEmailPort(loadSmtpConfig(env)!, {
      async sendMail() { throw new Error("never-log-this customer@example.test private text"); },
    });
    await expect(port.deliver(message)).rejects.toThrow(/^SMTP_DELIVERY_FAILED$/);
  });

  it("refuses a real SMTP server without STARTTLS before authentication or message data", async () => {
    const commands: string[] = [];
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.write("220 local smtp\r\n");
      socket.on("data", data => {
        commands.push(data.toString());
        if (data.toString().startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else socket.write("500 STARTTLS unavailable\r\n");
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test SMTP address");
      const config = loadSmtpConfig({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(address.port) })!;
      await expect(createSmtpQuoteEmailPort(config).deliver(message)).rejects.toThrow("SMTP_DELIVERY_FAILED");
      expect(commands.join("\n")).not.toMatch(/AUTH PLAIN |MAIL FROM|RCPT TO|DATA\r\n/);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
