import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../server/service.ts';
import {windows,stale,tone,left,label} from '../shared/model.ts';
const snapshot=(t:number)=>({fetchedAt:new Date(t).toISOString(),claude:{windows:[{windowSeconds:18000,usedPercent:27,resetsAt:new Date(t+60000).toISOString()}]}});
test('windows, thresholds, freshness and expired reset',()=>{
 const s={...snapshot(0),codex:{windows:[{windowSeconds:18000,usedPercent:1,resetsAt:new Date(0).toISOString()}]}};
 assert.equal(windows(s).length,1); assert.equal(label(s),'Claude 27%');
 assert.equal(stale(s,600000),false);assert.equal(stale(s,600001),true);
 assert.deepEqual([69,70,89,90].map(tone),['','warn','warn','bad']);assert.equal(left(new Date(0).toISOString(),60000),'0м');
});
test('refresh coalesces clients, waits for a new file, then enforces cooldown',async()=>{
 let now=100000, kicks=0; let file=snapshot(0);
 const service=createService({read:async()=>file,kick:async()=>{kicks++},now:()=>now,sleep:async ms=>{now+=ms;file=snapshot(now)},log:()=>{}});
 const [a,b]=await Promise.all([service.refresh(),service.refresh()]);
 assert.equal(kicks,1);assert.equal(a?.fetchedAt,b?.fetchedAt);assert.equal(a?.fetchedAt,new Date(now).toISOString());
 await service.refresh();assert.equal(kicks,1);
});
test('fresh poller file is only reread, even after plugin reload',async()=>{
 let kicks=0; const file=snapshot(95000);
 const service=createService({read:async()=>file,kick:async()=>{kicks++},now:()=>100000,sleep:async()=>{},log:()=>{}});
 assert.equal(await service.refresh(),file);assert.equal(kicks,0);
});
test('missing file and failed launch do not discard last good values or reject',async()=>{
 let fail=false;const logs:string[]=[];const file=snapshot(0);
 const service=createService({read:async()=>{if(fail)throw Error('invalid JSON');return file;},kick:async()=>{throw Error('launch failed')},now:()=>100000,sleep:async()=>{},log:s=>logs.push(s)});
 await service.read();fail=true;assert.equal(await service.refresh(),file);assert.ok(logs.length>=2);
});
test('timeout stops after 30 seconds and permits retry after cooldown',async()=>{
 let now=100000,kicks=0;const logs:string[]=[];
 const service=createService({read:async()=>snapshot(0),kick:async()=>{kicks++},now:()=>now,sleep:async ms=>{now+=ms},log:s=>logs.push(s)});
 await service.refresh();assert.equal(now,130000);assert.equal(logs.length,1);now=161000;await service.refresh();assert.equal(kicks,2);
});
