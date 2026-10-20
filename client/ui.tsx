import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PluginButtonContentProps } from '@getpaseo/plugin/client';
import type { LimitsState } from './state';
import { color, exact, stale, windowName, windows } from '../shared/model';
export function Details({theme,state}:PluginButtonContentProps & {state:LimitsState}) {
  const {data,busy,now}=useSyncExternalStore(state.subscribe,state.get);
  return <View style={{gap:14,minWidth:250,maxWidth:360}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Обновить лимиты" disabled={busy} onPress={()=>void state.refresh()}>
      <Text style={{color:theme.colors.foreground,fontSize:13}}>{busy?'Обновление...':'Обновить лимиты'}</Text>
    </Pressable>
    {windows(data).map(p=><View key={p.key} style={{gap:8}}>
      <Text style={{color:theme.colors.foreground,fontSize:13,fontWeight:'500'}}>{p.name}</Text>
      {p.windows.map(w=><View key={w.windowSeconds} style={{gap:5}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Text style={{color:theme.colors.foregroundMuted,fontSize:13}}>{windowName(w.windowSeconds)}</Text>
          <View style={{width:80,height:6,borderRadius:3,backgroundColor:theme.colors.surface2,overflow:'hidden'}}><View style={{width:`${w.usedPercent}%`,height:6,borderRadius:3,backgroundColor:color(w.usedPercent)}}/></View>
          <Text style={{color:w.usedPercent>=70?color(w.usedPercent):theme.colors.foreground,fontSize:13}}>{w.usedPercent}%</Text>
        </View>
        <Text style={{color:theme.colors.foregroundMuted,fontSize:12}}>Сброс {exact(w.resetsAt,now)}</Text>
      </View>)}
    </View>)}
    {!windows(data).length&&<Text style={{color:theme.colors.foregroundMuted}}>Данные пока недоступны</Text>}
    {data&&stale(data,now)&&<Text style={{color:theme.colors.foregroundMuted,fontSize:12}}>данные от {new Date(data.fetchedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</Text>}
  </View>;
}
