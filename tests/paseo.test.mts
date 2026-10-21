import {test} from "node:test";
import assert from "node:assert/strict";
import {fromPaseo,nativeReader} from "../server/paseo.ts";
const date=new Date().toISOString();
const row={providerId:"claude",status:"available",fetchedAt:date,windows:[{id:"five_hour",usedPct:27,resetsAt:date},{id:"weekly",remainingPct:60,resetsAt:date},{id:"weekly_opus",usedPct:1,resetsAt:date}]};
test("native quota keeps only subscription windows and strips account data",()=>{
 const s=fromPaseo({fetchedAt:date,providers:[row,{...row,providerId:"codex"}]})!;
 assert.equal(s.claude?.windows.length,2);assert.equal(s.claude?.windows[1].usedPercent,40);assert.equal(s.codex?.windows.length,2);
 assert.equal(fromPaseo({fetchedAt:date,providers:[{...row,status:"unavailable"}]}),null);
 assert.equal(fromPaseo({fetchedAt:date,providers:[row,row]}),null);
 assert.equal(fromPaseo({fetchedAt:date,providers:[{...row,windows:[{id:"weekly",usedPct:101,resetsAt:date}]}]}),null);
});
test("concurrent employees share one cached native quota call",async()=>{
 let calls=0,now=0;const read=nativeReader(async()=>{calls++;return {fetchedAt:date,providers:[row]};},()=>now);
 await Promise.all([read(),read(),read()]);assert.equal(calls,1);now=59999;await read();assert.equal(calls,1);now=60001;await read();assert.equal(calls,2);
});
