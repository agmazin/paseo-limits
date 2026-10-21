import type {Snapshot, LimitWindow} from "../shared/model";
interface Usage {providerId:string;status:string;fetchedAt?:string|null;windows:{id:string;usedPct?:number|null;remainingPct?:number|null;resetsAt?:string|null;shortLabel?:string}[]}
// Consume quota, not token counts. Never forward account labels, logins or errors.
export function fromPaseo(result:{fetchedAt:string;providers:Usage[]}):Snapshot|null {
 const snapshot:Snapshot={fetchedAt:result.fetchedAt};
 const dates:string[]=[];
 for(const key of ["claude","codex"] as const){
  const rows=result.providers.filter(p=>p.providerId===key&&p.status==="available");
  // A company must configure exactly one subscription per provider. Combining
  // unrelated accounts would advertise a quota that no single login has.
  if(rows.length!==1)continue;
  const row=rows[0];const windows:LimitWindow[]=[];
  for(const w of row.windows){
   const windowSeconds=w.id==="five_hour"||w.shortLabel==="5h"?18000:w.id==="weekly"||w.shortLabel==="wk"?604800:0;
   const used=w.usedPct??(w.remainingPct==null?null:100-w.remainingPct);
   if(windowSeconds&&used!=null&&Number.isFinite(used)&&used>=0&&used<=100&&w.resetsAt&&Number.isFinite(Date.parse(w.resetsAt)))windows.push({windowSeconds,usedPercent:used,resetsAt:w.resetsAt});
  }
  if(windows.length){snapshot[key]={windows};dates.push(row.fetchedAt??result.fetchedAt);}
 }
 if(!dates.length)return null;
 snapshot.fetchedAt=new Date(Math.min(...dates.map(Date.parse))).toISOString();
 return snapshot;
}
export function nativeReader(fetchUsage:()=>Promise<Parameters<typeof fromPaseo>[0]>,now=Date.now){
 let last=-Infinity;let cached:Snapshot|null=null;let pending:Promise<Snapshot|null>|undefined;
 return ()=>{
  if(now()-last<60000)return Promise.resolve(cached);
  return pending??=(async()=>{try{cached=fromPaseo(await fetchUsage());last=now();return cached;}finally{pending=undefined;}})();
 };
}
