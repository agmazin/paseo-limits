import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoSnapshot} from '../server/demo.ts';
test('only an explicitly enabled test source generates fresh synthetic windows; production timestamps stay intact',()=>{
 const now=Date.parse('2026-10-22T00:00:00Z'),expired=new Date(now-1000).toISOString();
 const source={testData:true,fetchedAt:expired,claude:{windows:[{windowSeconds:18000,usedPercent:23,resetsAt:expired}]}};
 assert.equal(demoSnapshot(source,false,now),source);
 const real={...source,testData:false};assert.equal(demoSnapshot(real,true,now),real);
 const next=demoSnapshot(source,true,now)!;assert.equal(next.fetchedAt,new Date(now).toISOString());assert.equal(next.claude!.windows[0].usedPercent,23);assert(Date.parse(next.claude!.windows[0].resetsAt)>now);assert.equal(source.claude.windows[0].resetsAt,expired);
});
