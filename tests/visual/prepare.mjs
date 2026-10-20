// Run from the repository. Creates only an isolated fixture plugin outside Yandex.Disk.
import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  symlink,
} from "node:fs/promises";
import { resolve } from "node:path";
const target = process.argv[2];
if (!target || target.includes("Yandex.Disk"))
  throw Error("Pass an external fixture directory");
for (const dir of ["client", "shared"]) {
  await mkdir(resolve(target, dir), { recursive: true });
}
for (const name of [
  "index.client.tsx",
  "package.json",
  "tsconfig.json",
  "client/state.ts",
  "client/web.ts",
  "client/provider-paths.ts",
  "client/ui.tsx",
  "shared/model.ts",
  "shared/contracts.ts",
])
  await copyFile(name, resolve(target, name));
await writeFile(
  resolve(target, "paseo-plugin.json"),
  JSON.stringify({
    id: "limits-visual",
    name: "Лимиты - визуальная проверка",
    version: "0.1.0",
    requirements: { paseo: ">=0.12.0" },
  }),
);
let entry = await readFile(resolve(target, "index.client.tsx"), "utf8");
entry = entry.replace(
  /mountRows\(\s*state,\s*theme,\s*layout.compact/,
  `mountRows(state,{...theme,colors:{...theme.colors,foreground:'#ececec',foregroundMuted:'#a6a6a6',surface0:'#1b1b1b',surface1:'#262626',border:'#333333'}},layout.compact`,
);
await writeFile(resolve(target, "index.client.tsx"), entry);
await writeFile(
  resolve(target, "index.server.ts"),
  `import type {PluginServerContext} from '@getpaseo/plugin/server';
import {readFile} from 'node:fs/promises';
import {readLimits,refreshLimits,snapshotSchema} from './shared/contracts';
const read=async()=>snapshotSchema.parse(JSON.parse(await readFile(${JSON.stringify(resolve(target, "fixture.json"))},'utf8')));
export default function(server:PluginServerContext){server.handle(readLimits,read);server.handle(refreshLimits,async()=>{await new Promise(r=>setTimeout(r,1500));return read()});return ()=>{}};`,
);
try {
  await symlink(resolve("node_modules"), resolve(target, "node_modules"));
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
