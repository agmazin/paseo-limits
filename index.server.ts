import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { readLimits, refreshLimits, snapshotSchema } from "./shared/contracts";
import { createService } from "./server/service";
import { nativeReader } from "./server/paseo";
const exec = promisify(execFile);
export default function contribute(server: PluginServerContext) {
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
  const read = async (_:unknown, {paseo}: Parameters<Parameters<typeof server.handle>[1]>[1]) => {
    if (process.env.PASEO_LIMITS_SOURCE === "paseo" && !process.env.PASEO_LIMITS_FILE) {
      readNative ??= nativeReader(() => paseo.providers.listUsage());
      try { return await readNative(); } catch { return null; }
    }
    return service.read();
  };
  server.handle(readLimits, read);
  server.handle(refreshLimits, process.env.PASEO_LIMITS_SOURCE === "paseo" || process.env.PASEO_LIMITS_FILE ? read : () => service.refresh());
  return () => {};
}
