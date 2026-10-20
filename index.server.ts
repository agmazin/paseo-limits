import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { readLimits, refreshLimits, snapshotSchema } from "./shared/contracts";
import { createService } from "./server/service";
const exec = promisify(execFile);
export default function contribute(server: PluginServerContext) {
  const service = createService({
    read: async () =>
      snapshotSchema.parse(
        JSON.parse(
          await readFile(
            join(homedir(), ".multica", "usage-limits.json"),
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
  server.handle(readLimits, () => service.read());
  server.handle(refreshLimits, () => service.refresh());
  return () => {};
}
