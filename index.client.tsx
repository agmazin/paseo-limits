import { useEffect } from 'react';
import type { PluginClientContext, PluginSidebarItemProps, PluginButtonContentProps, PluginButtonRegistration } from '@getpaseo/plugin/client';
import { createState } from './client/state';
import { Details } from './client/ui';
import { mountRows } from './client/web';
import { label } from './shared/model';
export default function contribute(client:PluginClientContext) {
  const state=createState(client);
  const pills=new Map<string,PluginButtonRegistration>();
  const lifetime=new AbortController();
  let available=false;
  const Content=(props:PluginButtonContentProps)=><Details {...props} state={state}/>;
  const update=()=>{for(const pill of pills.values())pill.update({label:label(state.get().data),visible:!available});};
  const unsubscribe=state.subscribe(update);
  function Bridge({theme,layout}:PluginSidebarItemProps) {
    useEffect(()=>mountRows(state,theme,layout.compact,value=>{if(available!==value){available=value;update();}}),[theme,layout.compact]);
    return null;
  }
  const removeBridge=client.addSidebarFooterItem({id:'limits-bridge',title:'Лимиты',Component:Bridge});
  const register=(agent:{id:string;workspaceId?:string|null})=>{
    if(lifetime.signal.aborted||!agent.workspaceId||pills.has(agent.id))return;
    pills.set(agent.id,client.addComposerPill({id:'limits',workspaceId:agent.workspaceId,agentId:agent.id,button:{title:'Лимиты подписок',label:label(state.get().data),icon:'Gauge',visible:!available,behavior:{kind:'popover',Content}}}));
  };
  const clear=()=>{for(const p of pills.values())p.remove();pills.clear();};
  void client.paseo.agents.list({subscribe:{},signal:lifetime.signal}).then(({subscription})=>{
    if(lifetime.signal.aborted)return;
    subscription.subscribe({snapshot:({entries})=>{clear();for(const {agent}of entries)register(agent);},update:message=>{if(message.type!=='agent_update')return;const u=message.payload;if(u.kind==='upsert')register(u.agent);else{pills.get(u.agentId)?.remove();pills.delete(u.agentId);}}});
  }).catch(()=>{if(!lifetime.signal.aborted)console.error('Лимиты: не удалось подписаться на диалоги');});
  return ()=>{lifetime.abort();removeBridge();clear();unsubscribe();state.dispose();};
}
