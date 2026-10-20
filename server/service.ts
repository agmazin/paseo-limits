import type { Snapshot } from "../shared/model";
export interface Dependencies {
  read(): Promise<Snapshot | null>;
  kick(): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}
// One refresh per plugin process, shared by all connected clients and panes.
export function createService(d: Dependencies) {
  let cached: Snapshot | null = null;
  let lastKick = -Infinity;
  let pending: Promise<Snapshot | null> | null = null;
  async function read() {
    try {
      const next = await d.read();
      if (next) cached = next;
    } catch {
      d.log("Не удалось прочитать файл лимитов; сохранены последние данные");
    }
    return cached;
  }
  async function run() {
    const before = await read();
    if (
      d.now() -
        Math.max(lastKick, before ? Date.parse(before.fetchedAt) : -Infinity) <
      60000
    )
      return before;
    lastKick = d.now();
    try {
      await d.kick();
      const until = d.now() + 30000;
      while (d.now() < until) {
        await d.sleep(500);
        const next = await read();
        if (next && next.fetchedAt !== before?.fetchedAt) return next;
      }
      d.log("Поллер не обновил fetchedAt за 30 секунд");
    } catch {
      d.log("Не удалось запустить поллер лимитов через launchctl");
    }
    return read();
  }
  return {
    read,
    refresh() {
      if (!pending)
        pending = run().finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
