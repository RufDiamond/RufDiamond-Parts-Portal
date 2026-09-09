import { expect, test } from "./customer-native.js";
import { startNativeFixture } from "../../apps/api/test/helpers/native-fixture.js";
import type { Page } from "@playwright/test";
let fixture: Awaited<ReturnType<typeof startNativeFixture>>;
test.beforeAll(async () => { fixture = await startNativeFixture("http://127.0.0.1:3207",3307); });
test.afterAll(async () => { await fixture?.stop(); });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const probe: Record<string, unknown> = { path: new URL(page.url()).pathname };
  probe.database = fixture?.failures;
  const bounded = async (name: string, action: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { probe[name] = await Promise.race([action, new Promise(resolve => { timer = setTimeout(() => resolve("timeout"),3000); })]); }
    catch { probe[name] = "unavailable"; } finally { clearTimeout(timer); }
  };
  await bounded("renderer", page.evaluate(()=>({ visibility:document.visibilityState,ready:document.readyState,origin:performance.timeOrigin })));
  await bounded("mappingInput",page.evaluate(()=>(window as unknown as {mappingProbe?:unknown[]}).mappingProbe));
  const cdp = await page.context().newCDPSession(page);
  await bounded("frame", cdp.send("Page.getFrameTree").then(value=>({path:new URL(value.frameTree.frame.url).pathname,hasFrame:!!value.frameTree.frame.id})));
  await bounded("browser", cdp.send("Browser.getVersion").then(value=>value.product));
  await cdp.detach();
  if (probe.path !== "/signin") await bounded("screenshot",page.screenshot({path:info.outputPath("failed-synthetic-page.png")}).then(()=>"saved"));
  await info.attach("bounded-failure-probes",{body:JSON.stringify(probe),contentType:"application/json"});
  console.error("Safe failure probes:", JSON.stringify(probe));
  await page.close({runBeforeUnload:false});
});

async function signIn(page: Page, account: string) {
  await page.goto("http://127.0.0.1:3207/signin");
  await page.getByLabel("Username:").fill(`${account}@native.test`);
  await page.getByLabel("Password:").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.visibilityState)).toBe("visible");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Username:")).toBeVisible();
}
test("real least-privilege admin upload mapping publication and scoped customer bytes", async ({ page }, testInfo) => {
  // Setup-only SQL verifies actual privilege denial without logging connection secrets.
  for (const sql of ["CREATE TABLE forbidden_probe(id int)", "TRUNCATE figure", "DELETE FROM figure", "UPDATE drawing_file SET filename='forbidden'", "UPDATE diagram_mapping_revision SET document='{}'::jsonb", "UPDATE release_figure SET name='forbidden'", "UPDATE app_user SET role_id=role_id", "SELECT * FROM \"order\"", "ALTER ROLE CURRENT_USER SUPERUSER"]) {
    await expect(fixture.runtime.pool.query(sql)).rejects.toThrow();
  }
  const attrs = (await fixture.runtime.pool.query("select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
  expect(Object.values(attrs).every(value => value === false)).toBe(true);
  const allowed = await fetch(`${fixture.storageEndpoint}/local-native-drawings/probe`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3207", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3207");
  const denied = await fetch(`${fixture.storageEndpoint}/local-native-drawings/probe`, { method: "OPTIONS", headers: { Origin: "https://foreign.example", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  await signIn(page,"publisher");
  await page.getByRole("link",{name:"Draft administration",exact:true}).click();
  await expect(page.getByText("Foreign figure",{ exact: true })).toHaveCount(0);
  await page.getByRole("link",{ name: "Local synthetic frame",exact:true }).click();
  await expect(page.getByLabel("First PNG")).toBeVisible();
  await expect(page.getByTestId("mapping-canvas")).toHaveCount(0);
  await page.getByLabel("First PNG").setInputFiles({ name:"first.png",mimeType:"image/png",buffer:fixture.png });
  const intentResponse = page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/drawing-uploads"));
  await page.getByRole("button",{name:"Upload first PNG",exact:true}).click();
  expect((await intentResponse).status(),"First upload intent succeeds for least-privilege runtime").toBe(201);
  await expect(page.getByRole("img",{name:"Authoritative drawing"})).toBeVisible();
  await expect(page.getByLabel("Source evidence")).toBeEnabled();
  await page.evaluate(()=>{
    const events: unknown[] = [];
    (window as unknown as { mappingProbe: unknown[] }).mappingProbe=events;
    document.addEventListener("input",event=>{
      const field=event.target;
      if(field instanceof HTMLTextAreaElement && field.closest("label")?.textContent?.includes("Source evidence")) events.push({type:"evidence-input",value:field.value,visible:document.visibilityState});
    });
    document.addEventListener("visibilitychange",()=>events.push({type:"visibility",value:document.visibilityState}));
  });
  await page.getByLabel("Source evidence").fill("Preserve local work through replacement");
  await expect(page.getByRole("status")).toContainText("Unsaved");
  await expect(page.getByLabel("Source evidence")).toHaveValue("Preserve local work through replacement");
  await page.getByLabel("Replacement PNG").setInputFiles({name:"replacement.png",mimeType:"image/png",buffer:fixture.replacement});
  await page.getByRole("button",{name:"Upload replacement PNG"}).click();
  await expect(page.getByText(/PNG attached\. Select the current/)).toBeVisible();
  expect(await page.getByLabel("Source evidence").inputValue()).toBe("Preserve local work through replacement");
  const selected = page.waitForEvent("dialog").then(async dialog=>{ expect(dialog.message()).toContain("Select the current drawing"); await dialog.accept(); });
  await page.getByRole("button",{name:"Select current drawing version"}).click();
  await selected;
  await expect(page.getByText("Current drawing version: 2.",{exact:false})).toBeVisible();
  await expect(page.getByRole("img",{name:"Authoritative drawing"})).toHaveAttribute("src",/figureVersion=3/);
  await expect(page.getByLabel("Source evidence")).toBeEnabled();
  await page.getByLabel("Source evidence").click();
  await expect(page.getByLabel("Source evidence")).toBeFocused();
  await page.getByLabel("Source evidence").fill("Disposable synthetic source: A* identifies the drawn rectangular bracket.");
  await expect(page.getByLabel("Source evidence")).toHaveValue("Disposable synthetic source: A* identifies the drawn rectangular bracket.");
  for (const [field,value] of Object.entries({x:"50",y:"30",width:"60",height:"40"})) await page.getByLabel(`Label ${field}`,{exact:true}).fill(value);
  await page.getByRole("button",{name:"Apply label rectangle"}).click();
  await page.getByRole("button",{name:"Add region",exact:true}).click();
  const canvas = page.getByTestId("mapping-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(); if (!box) throw new Error("Canvas unavailable");
  for(const [x,y] of [[180,130],[440,130],[440,320],[180,320]]) await page.mouse.click(box.x+x/640*box.width,box.y+y/480*box.height);
  await page.getByRole("button",{name:"Close ring",exact:true}).click();
  await expect(page.getByRole("button",{name:"Close ring",exact:true})).toBeDisabled();
  await expect(page.getByLabel("Source evidence")).toHaveValue("Disposable synthetic source: A* identifies the drawn rectangular bracket.");
  const saveResponse = page.waitForResponse(response=>response.request().method()==="PUT" && new URL(response.url()).pathname.endsWith("/diagram-mapping"));
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  const saved = await saveResponse;
  expect(saved.status()).toBe(200);
  expect((await saved.json()).document.occurrences[0].evidence).toBe("Disposable synthetic source: A* identifies the drawn rectangular bracket.");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Source evidence")).toHaveValue("Disposable synthetic source: A* identifies the drawn rectangular bracket.");
  await page.getByRole("button",{name:"Approve exact saved revision"}).click();
  await expect(page.getByRole("status")).toContainText("Approved revision");
  await page.screenshot({path:testInfo.outputPath("approved-synthetic-editor.png")});
  await page.getByRole("link",{name:"Publisher queue",exact:true}).click();
  await page.getByLabel("Release summary").fill("Disposable local synthetic release");
  await page.getByRole("button",{name:"Review publication"}).click();
  await page.getByRole("button",{name:"Confirm publish and activate"}).click();
  await expect(page.getByRole("status")).toContainText("Published release 1");
  await page.screenshot({path:testInfo.outputPath("published-synthetic-release.png")});
  await signOut(page);
  await signIn(page,"mapper");
  const mapperQueue = await page.request.get("http://127.0.0.1:3207/api/v1/admin/publication/queue"); expect(mapperQueue.status()).toBe(200);
  await page.goto("http://127.0.0.1:3207/admin/publish");
  await expect(page.getByRole("button",{name:"Review publication"})).toHaveCount(0);
  expect((await page.request.get(`http://127.0.0.1:3207/api/v1/admin/figures/${fixture.ids.foreignFigure}`)).status()).toBe(404);
  await signOut(page);
  await signIn(page,"customer");
  await page.goto(`http://127.0.0.1:3207/figures/${fixture.ids.figure}`);
  await expect(page.getByText("12.40",{exact:false}).first()).toBeVisible();
  const customerData = await page.request.get(`http://127.0.0.1:3207/api/v1/catalog/figures/${fixture.ids.figure}`);
  const detail = await customerData.json();
  const png = await page.request.get(`http://127.0.0.1:3207${detail.drawing.contentUrl}`);
  expect(png.status()).toBe(200); expect(await png.body()).toEqual(fixture.replacement);
  expect((await page.request.get(`http://127.0.0.1:3207/api/v1/admin/figures/${fixture.ids.figure}`)).status()).toBe(403);
  expect((await page.request.get(`http://127.0.0.1:3207/api/v1/catalog/figures/${fixture.ids.foreignFigure}`)).status()).toBe(404);
  await page.screenshot({path:testInfo.outputPath("customer-synthetic-drawing.png")});
  await page.goto("http://127.0.0.1:3207/admin?canPublish=1");
  await expect(page.getByRole("heading",{name:"Admin access unavailable"})).toBeVisible();
  await expect(page.getByText("Local synthetic frame",{exact:true})).toHaveCount(0);
  await page.goto(`http://127.0.0.1:3207/figures/${fixture.ids.figure}`);
  await signOut(page);
  await signIn(page,"technician");
  await page.goto(`http://127.0.0.1:3207/figures/${fixture.ids.figure}`);
  await expect(page.getByText("LOCAL-P1",{exact:true}).first()).toBeVisible();
  expect((await (await page.request.get("http://127.0.0.1:3207/api/v1/me")).json()).id).toBe(fixture.ids.technician);
  const tech = await page.request.get(`http://127.0.0.1:3207/api/v1/catalog/figures/${fixture.ids.figure}`);
  expect(JSON.stringify(await tech.json())).not.toContain("listPrice");
  await expect(page.getByText("12.40",{exact:false})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("technician-synthetic-drawing.png")});
});
test("headed-only actual backend revocation during true hidden tab return",async({page})=>{
  test.skip(process.env.CUSTOMER_CHROME_OPERATIONAL_HEADLESS==="true","Requires an undisturbed headed desktop; headless operational coverage is not visibility evidence.");
  await signIn(page,"technician");
  await page.goto(`http://127.0.0.1:3207/figures/${fixture.ids.figure}`);
  await expect(page.getByText("LOCAL-P1",{exact:true}).first()).toBeVisible();
  const other = await page.context().newPage(); await other.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.visibilityState)).toBe("hidden");
  await fixture.setup.query("update user_scope set fleet_mode='subset',version=version+1 where user_id=$1",[fixture.ids.technician]);
  await page.bringToFront(); await expect.poll(()=>page.evaluate(()=>document.visibilityState)).toBe("visible");
  await expect(page.getByText("LOCAL-P1",{exact:true})).toHaveCount(0);
  await expect(page.getByText("12.40",{exact:false})).toHaveCount(0);
  expect((await page.request.get(`http://127.0.0.1:3207/api/v1/catalog/figures/${fixture.ids.figure}`)).status()).toBe(404);
  await other.close();
});
