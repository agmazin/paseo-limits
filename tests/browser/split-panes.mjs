import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { _electron }=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const cli='/Users/agmazin/Library/Developer/paseo-cli012/node_modules/@getpaseo/cli/dist/index.js';
const command=(...args)=>execFileSync('node',[cli,...args,'--host','127.0.0.1:6797'],{stdio:'pipe',timeout:20000});
const source=process.env.LIMITS_SOURCE || resolve('.');
const out=resolve('docs/shots/0.2.8');mkdirSync(out,{recursive:true});
const report={pluginSource:source,host:'127.0.0.1:6797',client:'0.13.0',daemon:'0.12.0',checks:[]};
let electron;
try {
 command('plugin','remove','paseo-limits');command('plugin','install',source);
 const catalog=JSON.parse(command('plugin','ls','--json').toString());for(const item of catalog)if(!item.enabled)command('plugin','enable',item.id);
 electron=await _electron.launch({executablePath:'/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron',args:[resolve('tests/browser/split-host.cjs')]});
 electron.process().stderr.on('data',data=>process.stderr.write(data));
 const p=await electron.firstWindow();p.setDefaultTimeout(10000);
 p.on('websocket',ws=>{assert(!ws.url().includes(':6786/'));console.log('SOCKET',ws.url())});
 await p.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).replace('localhost:6786','127.0.0.1:6797').replace('127.0.0.1:6786','127.0.0.1:6797'),...args)}};const nativeFetch=window.fetch;window.fetch=(url,...args)=>nativeFetch(typeof url==='string'?url.replace('localhost:6786','127.0.0.1:6797').replace('127.0.0.1:6786','127.0.0.1:6797'):url,...args)});
 await p.goto('paseo://app/');
 await p.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('@paseo:app-settings'));settings.theme='dark';localStorage.setItem('@paseo:app-settings',JSON.stringify(settings))});await p.reload();
 await p.waitForSelector('[data-paseo-limits]');
 const info=await p.evaluate(async()=>{
  for(const script of document.scripts){
   if(!script.src.includes('/static/js/'))continue;
   const source=await(await fetch(script.src)).text();
   for(const line of source.split('\n')){
    if(!line.includes('hideAgent:')||!line.includes('layoutByWorkspace'))continue;
    const match=line.match(/\},(\d+),\[[\d,]*\]\);$/);if(!match)continue;
    for(const store of Object.values(window.__r(Number(match[1])))){
     if(typeof store?.getState!=='function'||!store.getState().layoutByWorkspace)continue;
     window.splitStore=store;
     return {layouts:store.getState().layoutByWorkspace,methods:Object.keys(store.getState())};
    }
   }
  }
 });

 assert(info,'workspace store found');
 const layout=async(count)=>p.evaluate(count=>{
  const store=window.splitStore,state=store.getState(),key=Object.keys(state.layoutByWorkspace)[0];
  const ids=['03e7e46f-0eaa-4068-9a43-c1a15d3fca97','d8198484-a39c-4f55-9000-fa99e206011c','0b717cc1-a52b-4579-95b1-cc08e290e735'];
  const tab=(id)=>({tabId:'agent_'+id,target:{kind:'agent',agentId:id},createdAt:Date.now()});
  const children=ids.slice(0,count).map((id,i)=>({kind:'pane',pane:{id:i?'split-'+i:'main',tabs:[tab(id)],tabIds:['agent_'+id],focusedTabId:'agent_'+id}}));
  children.push({kind:'pane',pane:{id:'explorer',tabs:[],tabIds:[],focusedTabId:null,hidden:true}});
  store.setState({layoutByWorkspace:{...state.layoutByWorkspace,[key]:{root:{kind:'group',group:{id:'workspace-root',direction:'horizontal',children,sizes:children.map(()=>1/children.length)}},focusedPaneId:'main'}}});
 },count);
 const check=async(name,count)=>{
  await p.waitForTimeout(900);
  const metrics=await p.evaluate(()=>[...document.querySelectorAll('[data-testid^="workspace-pane-"]')].filter(p=>p.querySelector('[data-testid="message-input-root"]')).map(p=>{
   const visible=selector=>[...p.querySelectorAll(selector)].find(n=>n.getBoundingClientRect().height>0);
   const rect=n=>n?.getBoundingClientRect().toJSON();
   const row=p.querySelector('[data-paseo-limits]');
   return {pane:rect(p),composer:rect(visible('[data-testid="message-input-root"]')),chat:rect(visible('[data-testid="agent-chat-scroll"]')),row:rect(row),margins:row?[getComputedStyle(row).marginTop,getComputedStyle(row).marginBottom]:[]};
  }));
  await p.screenshot({path:`${out}/${name}.png`});
  assert.equal(metrics.length,count,name);
  for(const m of metrics){assert(m.chat.height>100,name+' chat height');assert(m.composer.height>70,name+' composer height');assert(m.composer.y>m.pane.y+m.pane.height/2,name+' composer at bottom');assert(m.composer.bottom<=m.pane.bottom+1,name+' composer inside pane');assert(m.margins.every(x=>Math.abs(parseFloat(x))<=12),name+' bounded spacing');}
  report.checks.push({name,metrics});
  await p.screenshot({path:`${out}/${name}.png`});console.log('PASS',name);
 };
 for(const width of [1952,1440,1100]){
  await electron.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,950),width);
  for(const count of [1,2,3]){await layout(count);await check(`${width}-${count}-panes`,count);}
 }
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,950));
 await layout(2);await p.waitForTimeout(800);
 const source=p.getByTestId('workspace-tab-agent_03e7e46f-0eaa-4068-9a43-c1a15d3fca97');
 const target=p.getByTestId('workspace-pane-split-1').getByTestId('workspace-tabs-row');
 const from=await source.boundingBox(),to=await target.boundingBox();
 await p.mouse.move(from.x+30,from.y+15);await p.mouse.down();
 await p.mouse.move(to.x+to.width/2,to.y+15,{steps:30});await p.waitForTimeout(500);await p.mouse.up();
 await p.waitForTimeout(700);
 const moved=await p.evaluate(()=>{const s=window.splitStore.getState(),key=Object.keys(s.layoutByWorkspace)[0];return s.getTabDestination(key,'agent_03e7e46f-0eaa-4068-9a43-c1a15d3fca97')});
 assert.equal(moved.paneId,'split-1','drag to neighbouring pane');
 report.drag=true;
 await check('drag-neighbour',2);
 await layout(3);await p.reload();await p.waitForSelector('[data-paseo-limits]');await check('reload-three',3);
 writeFileSync('docs/split-panes-0.2.8.json',JSON.stringify(report,null,2)+'\n');
} finally {await electron?.close();}
