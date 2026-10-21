import type {Snapshot} from '../shared/model';
export function demoSnapshot(snapshot:Snapshot|null,enabled:boolean,now=Date.now()):Snapshot|null{
 if(!enabled||!snapshot?.testData)return snapshot;
 const next:Snapshot={...snapshot,fetchedAt:new Date(now).toISOString()};
 for(const key of ['claude','codex'] as const){
  if(!snapshot[key])continue;
  next[key]={windows:snapshot[key].windows.map(window=>{
   const end=Date.parse(window.resetsAt),duration=window.windowSeconds*1000;
   const reset=end>now?end:end+(Math.floor((now-end)/duration)+1)*duration;
   return {...window,resetsAt:new Date(reset).toISOString()};
  })};
 }
 return next;
}
