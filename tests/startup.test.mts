import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) ? specifier + ".ts" : specifier, context);
} });
const { createPills } = await import("../client/pills.ts");
const { createState } = await import("../client/state.ts");
hook.deregister();
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const snapshot = { fetchedAt: "2026-10-31T00:00:00Z", personal: true, claude: { windows: [{ windowSeconds: 604800, usedPercent: 27, resetsAt: "2026-11-05T00:00:00Z" }] } };
const agents = Array.from({ length: 96 }, (_, i) => ({ id: String(i), workspaceId: "a" }));

test("96 pills yield per four, deduplicate snapshots/queued updates, skip unchanged emits and dispose", async t => {
  const tasks = new Map<number, () => void>();
  let taskId = 0;
  t.mock.method(globalThis, "setTimeout", (fn: () => void) => { tasks.set(++taskId, fn); return taskId; });
  t.mock.method(globalThis, "clearTimeout", (id: number) => tasks.delete(id));
  const step = () => { const [id, fn] = [...tasks][0]; tasks.delete(id); fn(); };
  let data: typeof snapshot | null = snapshot;
  let emit = () => {};
  const adds: any[] = [], updates: any[] = [], removes: any[] = [];
  const pills = createPills({ addComposerPill: (pill: any) => {
    adds.push(pill);
    return { update: (button: any) => updates.push(button), remove: () => removes.push(pill) };
  } } as never, { get: () => ({ data }), subscribe: (fn: () => void) => { emit = fn; return () => {}; } } as never, (() => null) as never);
  pills.snapshot(agents);
  pills.snapshot(agents);
  assert.equal(adds.length, 0);
  await flush();
  assert.equal(adds.length, 0, "microtasks do not run the registration queue");
  pills.remove("95");
  pills.upsert({ id: "94", workspaceId: "replacement" });
  while (tasks.size) { const before = adds.length; step(); assert(adds.length - before <= 4); }
  assert.equal(adds.length, 95);
  assert.equal(adds.find(p => p.agentId === "94").workspaceId, "replacement");
  pills.snapshot(agents.filter(a => a.id !== "95").map(a => a.id === "94" ? { ...a, workspaceId: "replacement" } : a));
  assert.equal(tasks.size, 0);
  emit(); emit();
  assert.equal(updates.length, 0);
  pills.available(new Set(["0"]));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].visible, false);
  data = null; emit();
  assert.equal(updates.length, 96);
  data = snapshot; emit();
  assert.equal(updates.length, 191);
  pills.upsert({ id: "0", workspaceId: "b" });
  assert.equal(removes.length, 1);
  step();
  assert.equal(adds.at(-1).workspaceId, "b");
  pills.upsert({ id: "extra", workspaceId: "a" });
  pills.dispose(); emit();
  assert.equal(tasks.size, 0);
  assert.equal(removes.length, 96);
  pills.snapshot(agents);
  assert.equal(tasks.size, 0);
});

test("dispose before first chunk and midway cancels tail and removes only existing pills", t => {
  for (const chunks of [0, 1]) {
    const tasks = new Map<number, () => void>(); let id = 0, adds = 0, removes = 0;
    const timer = t.mock.method(globalThis, "setTimeout", (fn: () => void) => { tasks.set(++id, fn); return id; });
    const cancel = t.mock.method(globalThis, "clearTimeout", (key: number) => tasks.delete(key));
    const pills = createPills({ addComposerPill: () => { adds++; return { update() {}, remove() { removes++; } }; } } as never,
      { get: () => ({ data: snapshot }), subscribe: () => () => {} } as never, (() => null) as never);
    pills.snapshot(agents);
    if (chunks) { const [key, fn] = [...tasks][0]; tasks.delete(key); fn(); }
    pills.dispose();
    assert.equal(tasks.size, 0); assert.equal(adds, chunks * 4); assert.equal(removes, adds);
    timer.mock.restore(); cancel.mock.restore();
  }
});

test("one RPC in flight, provider change is replayed once, refresh returns fresh data, disposal ignores callbacks", async t => {
  let provider = () => {}, idle = (_: any) => {};
  const intervals: (() => void)[] = [];
  t.mock.method(globalThis, "setInterval", (fn: () => void) => { intervals.push(fn); return intervals.length; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const calls: { name: string; resolve: (value: any) => void; reject: (error: Error) => void }[] = [];
  let active = 0, maximum = 0, stopped = 0;
  const logs = t.mock.method(console, "error", () => {});
  const state = createState({ rpc: (contract: { name: string }) => {
    active++; maximum = Math.max(maximum, active);
    return new Promise((resolve, reject) => calls.push({ name: contract.name,
      resolve(value) { active--; resolve(value); }, reject(error) { active--; reject(error); } }));
  }, paseo: { providers: { subscribe(fn: () => void) { provider = fn; return () => { stopped++; }; } },
    agents: { subscribe(fn: typeof idle) { idle = fn; return () => { stopped++; }; } } } } as never);
  let emits = 0; state.subscribe(() => emits++);
  await flush();
  intervals[0](); intervals[0]();
  assert.equal(calls.length, 1);
  provider(); provider();
  calls[0].resolve(snapshot); await flush();
  assert.equal(calls.length, 2);
  assert.equal(state.get().data, null, "obsolete pre-config snapshot is not published");
  calls[1].resolve({ ...snapshot, claude: undefined }); await flush();
  assert.equal(calls.length, 2); assert.equal(state.get().data?.claude, undefined);
  intervals[0](); await flush();
  const refresh = state.refresh(); const duplicate = state.refresh();
  assert.equal(calls.length, 3);
  calls[2].resolve(snapshot); await flush();
  assert.equal(calls[3].name, "limits.refresh");
  calls[3].resolve({ ...snapshot, fetchedAt: "fresh" });
  await Promise.all([refresh, duplicate]);
  assert.equal(state.get().data?.fetchedAt, "fresh"); assert.equal(state.get().busy, false);
  assert.equal(maximum, 1);
  intervals[0](); await flush();
  const before = emits;
  state.dispose();
  provider(); idle({ kind: "upsert", agent: { status: "idle" } }); intervals[1]();
  calls[4].reject(Error("disposed")); await flush();
  assert.equal(calls.length, 5); assert.equal(emits, before); assert.equal(stopped, 2); assert.equal(logs.mock.callCount(), 0);
  await state.refresh(); assert.equal(calls.length, 5);
});

test("late successful refresh cannot publish after dispose and debounced callbacks are cancelled", async t => {
  let provider = () => {};
  let resolveRpc: (value: any) => void = () => {};
  let calls = 0;
  const timers = new Map<number, () => void>(); let timerId = 0;
  t.mock.method(globalThis, "setTimeout", (fn: () => void) => { timers.set(++timerId, fn); return timerId; });
  t.mock.method(globalThis, "clearTimeout", (id: number) => timers.delete(id));
  const state = createState({ rpc: () => { calls++; return new Promise(resolve => { resolveRpc = resolve; }); },
    paseo: { agents: { subscribe: () => () => {} }, providers: { subscribe(fn: () => void) { provider = fn; return () => {}; } } } } as never);
  resolveRpc(snapshot); await flush();
  provider(); assert.equal(timers.size, 1);
  const refresh = state.refresh();
  await flush();
  let emissions = 0; state.subscribe(() => emissions++);
  state.dispose(); assert.equal(timers.size, 0);
  resolveRpc({ ...snapshot, fetchedAt: "late" }); await refresh;
  assert.equal(state.get().data?.fetchedAt, snapshot.fetchedAt);
  assert.equal(emissions, 0); assert.equal(calls, 2);
});
