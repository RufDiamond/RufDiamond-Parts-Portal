import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { expect, it } from "vitest";
import { startNativeFixture } from "./helpers/native-fixture.js";
import { SOURCE_COLUMNS } from "../src/modules/imports/parser.js";

it("stages raw chunked CSV through real private versioned MinIO/clamd as non-owner and rejects infected or anonymous source access", async () => {
  const origin = "http://127.0.0.1:3218",
    fixture = await startNativeFixture(origin, 0);
  let cookie = "",
    csrf = "";
  try {
    await fixture.setup.query(
      "insert into user_capability(user_id,capability_key) values($1,'parts.import')",
      [fixture.ids.publisher],
    );
    const login = await fetch(`${fixture.apiOrigin}/api/v1/auth/sign-in`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        loginId: "publisher@native.test",
        password: fixture.password,
      }),
    });
    expect(login.status).toBe(200);
    cookie = login.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    csrf = (await login.json()).csrfToken;
    const cells = [
      "1",
      "IMPORT-NATIVE-P1",
      "Synthetic plate",
      "Local synthetic model",
      "Local variant",
      "Frame",
      "N.1",
      "Native import plate",
      "2026-01-01",
      "",
      "1",
      "7",
      "0.00",
      "",
      "S",
      "",
    ];
    const bytes = Buffer.from(
      [SOURCE_COLUMNS, cells].map((row) => row.join(",")).join("\n"),
    );
    const upload = async (source: Buffer, version = 1) => {
      const metadata = new URLSearchParams({
        modelId: fixture.ids.model,
        variantId: fixture.ids.variant,
        filename: "synthetic.csv",
        format: "csv",
        sourceKind: "synthetic",
        lineageKey: "native-import",
        sha256: createHash("sha256").update(source).digest("hex"),
      });
      return fetch(`${fixture.apiOrigin}/api/v1/admin/imports?${metadata}`, {
        method: "POST",
        headers: {
          origin,
          cookie,
          "x-csrf-token": csrf,
          "content-type": "text/csv",
          "if-match": `"${version}"`,
          "idempotency-key": randomUUID(),
        },
        body: Readable.toWeb(
          Readable.from([source.subarray(0, 100), source.subarray(100)]),
        ) as unknown as BodyInit,
        duplex: "half",
      } as RequestInit);
    };
    const response = await upload(bytes);
    expect(response.status, await response.clone().text()).toBe(201);
    const job = await response.json();
    const stored = (
      await fixture.setup.query(
        "select object_key,object_version_id,source_checksum,source_bytes from import_job where id=$1",
        [job.id],
      )
    ).rows[0];
    expect(stored.source_checksum).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(stored.source_bytes).toBe(bytes.length);
    expect(stored.object_version_id).toBeTruthy();
    expect(stored.object_version_id).not.toBe("null");
    expect(
      (
        await fetch(
          `${fixture.storageEndpoint}/local-native-drawings/${stored.object_key}`,
        )
      ).status,
    ).toBe(403);
    const send = (operation: string, version: number) =>
      fetch(
        `${fixture.apiOrigin}/api/v1/admin/imports/${job.id}/${operation}`,
        {
          method: "POST",
          headers: {
            origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": "application/json",
            "if-match": `"${version}"`,
            "idempotency-key": randomUUID(),
          },
          body: "{}",
        },
      );
    const validated = await send("validate", 1);
    expect(validated.status).toBe(200);
    const applied = await send("apply", (await validated.json()).version);
    expect(applied.status, await applied.clone().text()).toBe(200);
    expect((await applied.json()).aliases).toHaveLength(1);
    const infected = Buffer.from(
      bytes.toString().replace("Synthetic plate", "RUF_TASK7_INFECTED"),
    );
    expect((await upload(infected)).status).toBe(412);
    // Use the current target version so malware, not stale source coordination, is exercised.
    expect((await upload(infected, 2)).status).toBe(422);
    expect(fixture.failures).toEqual([]);
  } finally {
    await fixture.stop();
  }
}, 180000);
