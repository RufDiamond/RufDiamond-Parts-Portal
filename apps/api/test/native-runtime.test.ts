import { it, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { startNativeFixture } from "./helpers/native-fixture.js";

it("executes the disposable workflow over HTTP as non-owner runtime through real storage and scanner", async () => {
  const origin="http://127.0.0.1:3208", api="http://127.0.0.1:3308";
  const fixture=await startNativeFixture(origin,3308);
  let cookie="",csrf="";
  async function send(path:string, method="GET", body?:unknown, version?:number, key?:string) {
    return fetch(`${api}/api/v1/${path}`,{method,headers:{Origin:origin,Cookie:cookie,"X-CSRF-Token":csrf,...(body?{"Content-Type":"application/json"}:{}),...(version?{"If-Match":`"${version}"`}:{}),...(key?{"Idempotency-Key":key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  }
  async function login(account:string) {
    const response=await send("auth/sign-in","POST",{loginId:`${account}@native.test`,password:fixture.password});
    expect(response.status).toBe(200);
    cookie=response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    csrf=(await response.json()).csrfToken;
  }
  try {
    await login("publisher");
    const figure=`admin/figures/${fixture.ids.figure}`;
    for(const [index,bytes] of [fixture.png,fixture.replacement].entries()) {
      const intentResponse=await send(`${figure}/drawing-uploads`,"POST",{filename:`synthetic-${index}.png`,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")},index+1);
      expect(intentResponse.status).toBe(201);
      const intent=await intentResponse.json();
      expect((await fetch(intent.url,{method:"PUT",body:bytes,headers:intent.headers})).status).toBe(200);
      const attached=await send(`${figure}/drawing-uploads/${intent.uploadId}/finalize`,"POST",{},index+1);
      expect(attached.status).toBe(200); expect((await attached.json()).figureVersion).toBe(index+2);
    }
    const envelope=await (await send(`${figure}/diagram-mapping`)).json();
    const document=envelope.document;
    document.occurrences[0]={...document.occurrences[0],labelRegion:{x:50,y:30,width:60,height:40},regions:[{id:randomUUID(),outer:[[180,130],[440,130],[440,320],[180,320]],holes:[]}],evidence:"Disposable synthetic source: A* identifies the drawn rectangular bracket."};
    const savedResponse=await send(`${figure}/diagram-mapping`,"PUT",{document},envelope.version,randomUUID());
    expect(savedResponse.status).toBe(200);
    const saved=await savedResponse.json();
    expect((await (await send(`${figure}/diagram-mapping`)).json()).document).toEqual(saved.document);
    const approved=await send(`${figure}/diagram-mapping/approve`,"POST",{revisionId:saved.revisionId,checksum:saved.checksum},saved.version,randomUUID());
    expect(approved.status).toBe(200);
    const queue=await (await send("admin/publication/queue")).json();
    const model=queue.items.find((value:{modelId:string})=>value.modelId===fixture.ids.model);
    expect(model.blockers).toEqual([]);
    const publish=await send("admin/publication/releases","POST",{modelId:model.modelId,expectedWorkingVersion:model.workingVersion,expectedPublicationVersion:model.publicationVersion,summary:"Disposable local HTTP verification"},undefined,randomUUID());
    expect(publish.status).toBe(201);
    await login("mapper"); expect((await send("admin/publication/queue")).status).toBe(200);
    expect((await send("admin/publication/releases","POST",{modelId:model.modelId,expectedWorkingVersion:model.workingVersion,expectedPublicationVersion:model.publicationVersion,summary:"Must not publish"},undefined,randomUUID())).status).toBe(403);
    await login("customer"); expect((await send(figure)).status).toBe(403);
    const detail=await (await send(`catalog/figures/${fixture.ids.figure}`)).json();
    const png=await fetch(`${api}${detail.drawing.contentUrl}`,{headers:{Cookie:cookie,Accept:"image/png"}});
    expect(png.status).toBe(200); expect(Buffer.from(await png.arrayBuffer())).toEqual(fixture.replacement);
    await login("technician");
    const technician=await (await send(`catalog/figures/${fixture.ids.figure}`)).json();
    expect(JSON.stringify(technician)).not.toContain("listPrice");
    expect((await send(`catalog/figures/${fixture.ids.foreignFigure}`)).status).toBe(404);
    expect(fixture.failures).toEqual([]);
  } finally { await fixture.stop(); }
},180000);
