import type { PluginClientContext } from "@getpaseo/plugin/client";
import { readLimits, refreshLimits } from "../shared/contracts";
import { withTimeout } from "../shared/deadline";
import type { Snapshot } from "../shared/model";

export function createState(client: PluginClientContext) {
  let value = { data: null as Snapshot | null, busy: false, now: Date.now() };
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let flight: Promise<void> | undefined;
  let manual: Promise<void> | undefined;
  let reread: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;

  function publish(next: typeof value) {
    if (lifetime.signal.aborted) return;
    value = next;
    for (const fn of listeners) fn();
  }

  function scheduleRead() {
    if (reread !== undefined || lifetime.signal.aborted) return;
    reread = setTimeout(() => { reread = undefined; poll(); }, 100);
  }

  function start(mode: "read" | "refresh", replay = false): Promise<void> {
    const atStart = revision;
    const refresh = mode === "refresh";
    const request = async () => {
      try {
        const data = await withTimeout(
          client.rpc(refresh ? refreshLimits : readLimits, {}),
          refresh ? 15_000 : 8_000,
          lifetime.signal,
        );
        if (revision === atStart || replay || refresh) {
          publish({ ...value, data, now: Date.now() });
        }
      } catch {
        if (!lifetime.signal.aborted) console.error("Лимиты: RPC " + (refresh ? "обновления" : "чтения") + " недоступен");
      }
    };
    flight = request().finally(() => {
      flight = undefined;
      if (lifetime.signal.aborted || revision === atStart) return;
      // One immediate replay catches a config change. Further events share a later poll.
      if (!manual && !replay && !refresh) void start("read", true);
      else scheduleRead();
    });
    return flight;
  }

  function poll() {
    if (!flight && !manual && !lifetime.signal.aborted) void start("read");
  }
  function invalidate() {
    if (lifetime.signal.aborted) return;
    revision++;
    if (!flight) scheduleRead();
  }

  const stopProviders = client.paseo.providers.subscribe(invalidate);
  const stopAgents = client.paseo.agents.subscribe(update => {
    if (value.data?.personal && update.kind === "upsert" && update.agent.status === "idle") invalidate();
  });
  const polling = setInterval(poll, 60_000);
  const ticking = setInterval(() => publish({ ...value, now: Date.now() }), 30_000);
  poll();

  return {
    get: () => value,
    subscribe(fn: () => void) {
      if (lifetime.signal.aborted) return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    refresh() {
      if (lifetime.signal.aborted) return Promise.resolve();
      if (manual) return manual;
      const update = async () => {
        if (flight) await flight;
        if (!lifetime.signal.aborted) await start("refresh");
      };
      manual = update().finally(() => {
        manual = undefined;
        publish({ ...value, busy: false });
      });
      publish({ ...value, busy: true });
      return manual;
    },
    dispose() {
      lifetime.abort();
      stopAgents();
      stopProviders();
      clearTimeout(reread);
      clearInterval(polling);
      clearInterval(ticking);
      listeners.clear();
    },
  };
}
export type LimitsState = ReturnType<typeof createState>;
