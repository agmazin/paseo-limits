import { displaySettings } from "./shared/settings";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { writeFile, rename, chmod } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { readLimits, refreshLimits, snapshotSchema } from "./shared/contracts";
import { createService } from "./server/service";
import { demoSnapshot } from "./server/demo";
import { nativeReader } from "./server/paseo";
import { createVisibility } from "./server/visibility";
const exec = promisify(execFile);
export default function contribute(server: PluginServerContext) {
  server.registerSettings(displaySettings);
  const service = createService({
    read: async () =>
      snapshotSchema.parse(
        JSON.parse(
          await readFile(
            process.env.PASEO_LIMITS_FILE || join(homedir(), ".multica", "usage-limits.json"),
            "utf8",
          ),
        ),
      ),
    kick: async () => {
      if (process.platform !== "darwin" || !process.getuid)
        throw Error("macOS required");
      await exec(
        "/bin/launchctl",
        [
          "kickstart",
          "-k",
          `gui/${process.getuid()}/com.agmazin.multica-usage-push`,
        ],
        { timeout: 5000 },
      );
    },
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (message) => console.error(message),
  });
  let readNative: ReturnType<typeof nativeReader> | undefined;
  let context: Parameters<Parameters<typeof server.handle>[1]>[1] | undefined;
  let visibility: ReturnType<typeof createVisibility> | undefined;
  const readSource = async (_:unknown, {paseo}: Parameters<Parameters<typeof server.handle>[1]>[1]) => {
    if (process.env.PASEO_LIMITS_SOURCE === "paseo" && !process.env.PASEO_LIMITS_FILE) {
      readNative ??= nativeReader(() => paseo.providers.listUsage());
      try { return await readNative(); } catch { return null; }
    }
    return service.read();
  };
  const read = async (input:unknown, next: Parameters<Parameters<typeof server.handle>[1]>[1], refresh = false) => {
    context=next;
    const source = refresh && !process.env.PASEO_LIMITS_FILE && process.env.PASEO_LIMITS_SOURCE !== "paseo"
      ? await service.refresh()
      : await readSource(input,next);
    visibility ??= createVisibility(() => next.paseo.config.get(), (message) => console.error(message));
    const snapshot=await visibility(demoSnapshot(source,process.env.PASEO_LIMITS_DEMO_RENEW==="true"));
    const file=process.env.PASEO_LIMITS_EXPORT_FILE;
    if(file && snapshot){
      await writeFile(file+".new",JSON.stringify(snapshot),{mode:0o600});
      await chmod(file+".new",0o600);
      await rename(file+".new",file);
    }
    return snapshot;
  };
  let pending:Promise<unknown>|undefined;
  const serializedRead = (input:unknown,next: Parameters<Parameters<typeof server.handle>[1]>[1], refresh = false) => {
    if(pending)return pending as ReturnType<typeof read>;
    const task=read(input,next,refresh).finally(()=>{pending=undefined;});pending=task;return task;
  };
  const timer=process.env.PASEO_LIMITS_EXPORT_FILE?setInterval(()=>{if(context)void serializedRead({},context).catch(()=>console.error("Не удалось обновить серверный снимок лимитов"));},60000):undefined;
  server.handle(readLimits, serializedRead);
  server.handle(refreshLimits, async (input, next) => {
    if (pending) await pending;
    return serializedRead(input, next, true);
  });
  return () => {if(timer)clearInterval(timer);};
}
