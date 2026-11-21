import { displaySettings } from "./shared/settings";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileSnapshotSchema, readLimits, refreshLimits } from "./shared/contracts";
import { withTimeout } from "./shared/deadline";
import { createService } from "./server/service";
import { demoSnapshot } from "./server/demo";
import { nativeReader } from "./server/paseo";
import { createVisibility } from "./server/visibility";
import { deepseekReader } from "./server/deepseek";
const exec = promisify(execFile);
export default function contribute(server: PluginServerContext) {
  server.registerSettings(displaySettings);
  const service = createService({
    read: async () => {
      const file = process.env.PASEO_LIMITS_FILE || join(homedir(), ".multica", "usage-limits.json");
      const content = await withTimeout(readFile(file, "utf8"), 1000);
      return fileSnapshotSchema.parse(JSON.parse(content));
    },
    kick: async () => {
      if (process.platform !== "darwin" || !process.getuid)
        throw Error("macOS required");
      await exec(
        "/bin/launchctl",
        [
          "kickstart",
          `gui/${process.getuid()}/com.agmazin.multica-usage-push`,
        ],
        { timeout: 5000 },
      );
    },
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (message) => console.error(message),
  });
  const dshHome = process.env.PASEO_DEEPSEEK_DSH_HOME || join(homedir(), ".dsh");
  const readDeepseek = deepseekReader(
    () => withTimeout(readFile(join(dshHome, ".credentials.yaml"), "utf8"), 1000),
    async (token) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch("https://platform.deepseek.com/api/v0/users/get_user_summary", {
          headers: { "x-dsh-auth-token": token },
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) throw Error("DeepSeek balance unavailable");
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    },
  );
  type RequestContext = Parameters<Parameters<typeof server.handle>[1]>[1];
  let context: RequestContext;
  const readNative = nativeReader(() => withTimeout(context.paseo.providers.listUsage(), 5000));
  const visible = createVisibility(() => withTimeout(context.paseo.config.get(), 2000), console.error);

  async function readSource(refresh: boolean) {
    if (process.env.PASEO_LIMITS_FILE) return service.read();
    if (process.env.PASEO_LIMITS_SOURCE === "paseo") {
      try { return await readNative(); } catch { return null; }
    }
    return refresh ? service.refresh() : service.read();
  }

  async function read(next: RequestContext, refresh = false) {
    context = next;
    const [source, deepseek] = await Promise.all([readSource(refresh), readDeepseek()]);
    const withBalance = deepseek ? { ...(source ?? { fetchedAt: deepseek.fetchedAt }), deepseek } : source;
    const snapshot = await visible(demoSnapshot(withBalance, process.env.PASEO_LIMITS_DEMO_RENEW === "true"));
    const file = process.env.PASEO_LIMITS_EXPORT_FILE;
    if (file && snapshot) {
      await writeFile(file + ".new", JSON.stringify(snapshot), { mode: 0o600 });
      await chmod(file + ".new", 0o600);
      await rename(file + ".new", file);
    }
    return snapshot;
  }

  let reading: ReturnType<typeof read> | undefined;
  let refreshing: ReturnType<typeof read> | undefined;
  function poll(next: RequestContext) {
    if (reading) return reading;
    if (refreshing) return refreshing;
    reading = read(next).finally(() => { reading = undefined; });
    return reading;
  }

  server.handle(readLimits, (_, next) => poll(next));
  server.handle(refreshLimits, (_, next) => {
    if (refreshing) return refreshing;
    const refresh = () => read(next, true);
    const task = reading ? reading.then(refresh, refresh) : refresh();
    refreshing = task.finally(() => { refreshing = undefined; });
    return refreshing;
  });

  const timer = process.env.PASEO_LIMITS_EXPORT_FILE ? setInterval(() => {
    if (context) void poll(context).catch(() => console.error("Не удалось обновить серверный снимок лимитов"));
  }, 60000) : undefined;
  return () => { clearInterval(timer); };
}
