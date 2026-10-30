import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVisibility } from "../server/visibility.ts";
import { label, windows } from "../shared/model.ts";

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    return next(specifier, context);
  },
});
const { default: contribute } = await import("../index.server.ts");
const { createState } = await import("../client/state.ts");
hook.deregister();
const date = new Date().toISOString();
const provider = { windows: [{ windowSeconds: 604800, usedPercent: 27, resetsAt: date }] };
const snapshot = { fetchedAt: date, testData: true, personal: true, claude: provider, codex: provider };

test("explicit disable hides every provider without mutating quota; defaults and re-enable retain it", async () => {
  let providers: Record<string, { enabled?: boolean }> = { claude: { enabled: false } };
  const visible = createVisibility(async () => ({ config: { providers } }), () => {});
  const filtered = await visible(snapshot);
  assert.deepEqual(windows(filtered).map(p => p.key), ["codex"]);
  assert(!label(filtered).includes("Claude"));
  assert.equal(filtered?.personal, true);
  assert.equal(filtered?.fetchedAt, date);
  assert.equal(snapshot.claude, provider);
  providers = { codex: { enabled: false } };
  assert.deepEqual(windows(await visible(snapshot)).map(p => p.key), ["claude"]);
  providers = { claude: { enabled: false }, codex: { enabled: false } };
  assert.deepEqual(windows(await visible(snapshot)), []);
  providers = { claude: { enabled: true }, codex: {} };
  assert.deepEqual(await visible(snapshot), snapshot);
  assert.equal(await visible(null), null);
});

test("config failure preserves last explicit disable and does not equate availability with enablement", async () => {
  let fail = false;
  const logs: string[] = [];
  const visible = createVisibility(async () => {
    if (fail) throw Error("temporary config error");
    return { config: { providers: { claude: { enabled: false }, codex: { enabled: true, status: "error", available: false } } } };
  }, message => logs.push(message));
  await visible(snapshot);
  fail = true;
  assert.deepEqual(windows(await visible(snapshot)).map(p => p.key), ["codex"]);
  assert.equal(logs.length, 1);
});

test("real read and refresh handlers filter file, cached broken file, native cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "limits-visibility-"));
  const saved = { ...process.env };
  try {
    for (const mode of ["file", "paseo"]) {
      const file = join(dir, mode + ".json");
      const output = join(dir, mode + "-export.json");
      await writeFile(file, JSON.stringify(snapshot));
      process.env.PASEO_LIMITS_EXPORT_FILE = output;
      delete process.env.PASEO_LIMITS_DEMO_RENEW;
      process.env.PASEO_LIMITS_FILE = mode === "file" ? file : "";
      process.env.PASEO_LIMITS_SOURCE = mode === "paseo" ? "paseo" : "";
      const handlers = new Map<string, Function>();
      let enabled = false;
      let usageCalls = 0;
      const context = { paseo: {
        config: { get: async () => ({ config: { providers: { claude: { enabled }, codex: { enabled: true } } } }) },
        providers: { listUsage: async () => {
          usageCalls++;
          return { fetchedAt: date, providers: ["claude", "codex"].map(providerId => ({ providerId, status: "available", fetchedAt: date, windows: [{ id: "weekly", usedPct: 27, resetsAt: date }] })) };
        } },
      } };
      const cleanup = contribute({ registerSettings() {}, handle(contract: { name: string }, handler: Function) { handlers.set(contract.name, handler); } } as never);
      try {
        for (const name of ["limits.read", "limits.refresh"]) {
          const result = await handlers.get(name)!({}, context);
          assert.equal(result.claude, undefined, mode + " " + name);
          assert(result.codex);
          assert.equal(JSON.parse(await readFile(output, "utf8")).claude, undefined);
        }
        if (mode === "file") await writeFile(file, "broken JSON");
        enabled = true;
        assert((await handlers.get("limits.refresh")!({}, context)).claude, mode + " re-enable");
        enabled = false;
        assert.equal((await handlers.get("limits.refresh")!({}, context)).claude, undefined);
        if (mode === "paseo") assert.equal(usageCalls, 1, "visibility bypasses native minute cache");
      } finally {
        await cleanup?.();
      }
    }
  } finally {
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  }
});


test("provider catalog update rereads shared inline/pill state and disposal releases subscriptions", async () => {
  let update: () => void = () => {};
  let calls = 0;
  let stopped = 0;
  let data = snapshot;
  const state = createState({
    rpc: async () => { calls++; return data; },
    paseo: {
      agents: { subscribe: () => () => { stopped++; } },
      providers: { subscribe: (listener: () => void) => { update = listener; return () => { stopped++; }; } },
    },
  } as never);
  try {
    await new Promise(resolve => setTimeout(resolve, 10));
    assert(state.get().data?.claude);
    data = { ...snapshot, claude: undefined } as never;
    update();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(state.get().data?.claude, undefined);
    assert(!label(state.get().data).includes("Claude"));
    assert.equal(calls, 2);
    data = snapshot;
    await state.refresh();
    assert(state.get().data?.claude);
  } finally {
    state.dispose();
  }
  assert.equal(stopped, 2);
});
