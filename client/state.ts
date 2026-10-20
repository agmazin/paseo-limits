import { QueryClient } from '@tanstack/react-query';
import type { PluginClientContext } from '@getpaseo/plugin/client';
import { readLimits, refreshLimits } from '../shared/contracts';
import type { Snapshot } from '../shared/model';
export function createState(client: PluginClientContext) {
  const queries=new QueryClient({defaultOptions:{queries:{retry:false}}});
  let value={data:null as Snapshot|null,busy:false,now:Date.now()};
  const listeners=new Set<()=>void>();
  let alive=true;
  const emit=()=>{if(alive)for(const fn of listeners)fn();};
  async function read() {
    try {
      const data=await queries.fetchQuery({queryKey:['limits'],queryFn:()=>client.rpc(readLimits,{})});
      if(alive){value={...value,data};emit();}
    } catch { console.error('Лимиты: RPC чтения недоступен'); }
  }
  const polling=setInterval(()=>void read(),60000);
  const ticking=setInterval(()=>{value={...value,now:Date.now()};emit();},30000);
  void read();
  return {
    get:()=>value,
    subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},
    async refresh(){
      if(value.busy)return;
      value={...value,busy:true};emit();
      try {
        const data=await client.rpc(refreshLimits,{});
        if(alive){queries.setQueryData(['limits'],data);value={...value,data,now:Date.now()};}
      } catch {console.error('Лимиты: RPC обновления недоступен');}
      finally {value={...value,busy:false};emit();}
    },
    dispose(){alive=false;clearInterval(polling);clearInterval(ticking);queries.clear();listeners.clear();},
  };
}
export type LimitsState=ReturnType<typeof createState>;
