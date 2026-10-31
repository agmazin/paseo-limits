import { QueryClient } from "@tanstack/react-query";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { readLimits, refreshLimits } from "../shared/contracts";
import type { Snapshot } from "../shared/model";
export function createState(client: PluginClientContext) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let value = { data: null as Snapshot | null, busy: false, now: Date.now() };
  const listeners = new Set<() => void>();
  let alive = true;
  let flight: Promise<void> | undefined;
  let pending: "read" | "refresh" | undefined;
  const emit = () => {
    if (alive) for (const fn of listeners) fn();
  };
  function request(mode: "read" | "refresh" = "read", invalidate = false): Promise<void> {
    if (!alive) return Promise.resolve();
    if (mode === "refresh") {
      pending = "refresh";
      if (!value.busy) { value = { ...value, busy: true }; emit(); }
    } else if (!flight || invalidate) {
      pending ??= "read";
    }
    if (flight) return flight;
    flight = (async () => {
      while (alive && pending) {
        const next = pending;
        pending = undefined;
        try {
          const data = await queries.fetchQuery({
            queryKey: ["limits", next],
            queryFn: () => client.rpc(next === "refresh" ? refreshLimits : readLimits, {}),
            staleTime: 0,
          });
          if (alive && !pending) {
            value = { ...value, data, now: Date.now() };
            emit();
          }
        } catch {
          if (alive) console.error("Лимиты: RPC " + (next === "refresh" ? "обновления" : "чтения") + " недоступен");
        }
      }
    })().finally(() => {
      flight = undefined;
      if (!alive) return;
      if (pending) return request();
      if (value.busy) { value = { ...value, busy: false }; emit(); }
    });
    return flight;
  }
  let reread: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (!alive) return;
    if (reread !== undefined) clearTimeout(reread);
    // Mark an in-flight result obsolete immediately, before the debounce fires.
    if (flight) { void request("read", true); return; }
    reread = setTimeout(() => { reread = undefined; void request("read", true); }, 100);
  };
  const stopProviders = client.paseo.providers.subscribe(invalidate);
  const stopAgents = client.paseo.agents.subscribe(update => {
    if (value.data?.personal && update.kind === "upsert" && update.agent.status === "idle") invalidate();
  });
  const polling = setInterval(() => void request(), 60000);
  const ticking = setInterval(() => {
    if (!alive) return;
    value = { ...value, now: Date.now() };
    emit();
  }, 30000);
  void request();
  return {
    get: () => value,
    subscribe(fn: () => void) {
      if (!alive) return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    refresh() {
      if (value.busy) return flight ?? Promise.resolve();
      return request("refresh");
    },
    dispose() {
      alive = false;
      pending = undefined;
      stopAgents();
      stopProviders();
      if (reread !== undefined) clearTimeout(reread);
      clearInterval(polling);
      clearInterval(ticking);
      queries.clear();
      listeners.clear();
    },
  };
}
export type LimitsState = ReturnType<typeof createState>;
