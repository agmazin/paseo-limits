import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const hostRoot = process.env.PASEO_HOST_MODULE_ROOT;
const compilerPath = process.env.PASEO_PLUGIN_COMPILER;
const buttonRoot = process.env.PASEO_BUTTON_SOURCE;
if (!hostRoot || !compilerPath || !buttonRoot) throw Error('Set PASEO_HOST_MODULE_ROOT, PASEO_PLUGIN_COMPILER and PASEO_BUTTON_SOURCE');
const require = createRequire(resolve(hostRoot, '_limits-host.cjs'));
const Shared = await import(pathToFileURL(resolve(hostRoot, '@getpaseo/plugin/dist/index.js')).href);
const modules = { react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'), '@getpaseo/plugin': Shared,
  '@tanstack/react-query': require('@tanstack/react-query'), zod: require('zod') };
const scratch = mkdtempSync(join(tmpdir(), 'limits-native-'));
try {
  for (const name of ['model', 'validation']) {
    const code = ts.transpileModule(readFileSync(join(buttonRoot, name + '.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace('"./validation"', '"./validation.mjs"');
    writeFileSync(join(scratch, name + '.mjs'), code);
  }
  const { PluginButtonStore } = await import(pathToFileURL(join(scratch, 'model.mjs')).href);
  const { compilePlugin } = await import(pathToFileURL(compilerPath).href);
  const { clientBundle } = await compilePlugin({ client: resolve('index.client.tsx'), server: null });
  const baseline = process.env.PASEO_BASELINE_CATALOG
    ? JSON.parse(readFileSync(process.env.PASEO_BASELINE_CATALOG, 'utf8')).find(p => p.id === 'paseo-limits').clientBundle : null;
  const reports = [];
  async function run(bundle, name, disposeAt = 'complete') {
    const noop = () => {};
    let callbacks, provider, task = 0, adds = 0, updates = 0, removes = 0, publishes = 0;
    const perTask = new Map(), timers = new Set(), intervals = [];
    const agents = Array.from({ length: 96 }, (_, i) => ({ agent: { id: 'fixture-' + i, workspaceId: 'fixture-w' } }));
    const snapshot = { fetchedAt: '2026-10-31T00:00:00Z', claude: { windows: [{ windowSeconds: 604800, usedPercent: 27, resetsAt: '2026-11-05T00:00:00Z' }] } };
    const store = new PluginButtonStore({ parseIcon: icon => icon });
    store.subscribe(() => publishes++);
    const client = {
      rpc: async () => snapshot,
      paseo: {
        agents: { subscribe: () => noop, list: async () => ({ subscription: { subscribe(handler) { callbacks = handler; handler.snapshot({ entries: agents }); } } }) },
        providers: { subscribe(fn) { provider = fn; return noop; } },
      },
      addSettingsScreen: () => noop, addSidebarFooterItem: () => noop,
      addComposerPill(pill) {
        adds++; perTask.set(task, (perTask.get(task) ?? 0) + 1);
        const handle = store.addComposerPill({ serverId: 'fixture-host', id: 'paseo-limits', i18n: { resolve: String, subscribe: () => noop } }, pill);
        return { update(patch) { updates++; handle.update(patch); }, remove() { removes++; handle.remove(); } };
      },
    };
    const host = new Proxy({}, { get: () => () => null });
    const native = new Proxy({ Platform: { OS: 'android' }, StyleSheet: { create: x => x } }, { get: (target, key) => key in target ? target[key] : () => null });
    const context = vm.createContext({ console, AbortController, Date, Promise, queueMicrotask,
      setTimeout(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); task++; fn(); }, ms); timers.add(timer); return timer; },
      clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
      setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval: noop,
    });
    context.global = context; context.window = context; context.globalThis = context;
    const factory = vm.runInContext(bundle, context);
    const exports = factory(id => id === 'react-native' ? native : id.startsWith('@getpaseo/plugin/client') ? host : modules[id] ?? (() => { throw Error(id); })());
    const cleanup = exports.default(client);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const initialAdds = adds;
    if (disposeAt === 'midway') await new Promise(resolve => setTimeout(resolve, 1));
    if (disposeAt !== 'complete') {
      cleanup();
      await new Promise(resolve => setTimeout(resolve, 15));
      assert.equal(timers.size, 0); assert.equal(removes, adds);
      if (disposeAt === 'before') assert.equal(adds, 0);
      if (disposeAt === 'midway') assert(adds > 0 && adds < 96);
      reports.push({ name, disposeAt, adds, removes }); return;
    }
    while (adds < 96) await new Promise(resolve => setTimeout(resolve, 5));
    const startupPublishes = publishes;
    const startupUpdates = updates;
    intervals[1]();
    const unchangedTickUpdates = updates - startupUpdates;
    provider();
    await new Promise(resolve => setTimeout(resolve, 120));
    const unchangedReadUpdates = updates - startupUpdates - unchangedTickUpdates;
    const beforeRepeat = adds;
    callbacks.snapshot({ entries: agents });
    await new Promise(resolve => setTimeout(resolve, 40));
    const repeatAdds = adds - beforeRepeat;
    cleanup();
    assert.equal(timers.size, 0);
    const report = { name, initialAdds, maxAddsPerTask: Math.max(...perTask.values()), startupPublishes, startupUpdates, unchangedTickUpdates, unchangedReadUpdates, repeatAdds, adds, removes };
    reports.push(report);
    if (name === 'after' || name === 'reconnect') {
      assert.equal(initialAdds, 0); assert(report.maxAddsPerTask <= 4);
      assert.equal(unchangedTickUpdates, 0); assert.equal(unchangedReadUpdates, 0); assert.equal(repeatAdds, 0);
      assert.equal(adds, 96); assert.equal(removes, 96);
    }
  }
  if (baseline) await run(baseline, 'before');
  await run(clientBundle, 'after');
  await run(clientBundle, 'before-dispose', 'before');
  await run(clientBundle, 'midway-dispose', 'midway');
  await run(clientBundle, 'reconnect');
  const result = { scope: 'Actual compiler bundle, upstream 0.13.2 PluginButtonStore, Mac V8 VM, Android branch, no DOM, RN UI stubs, real setTimeout tasks. No phone FPS/render measurements.', reports };
  if (process.env.PASEO_NATIVE_REPORT) writeFileSync(process.env.PASEO_NATIVE_REPORT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { rmSync(scratch, { recursive: true, force: true }); }
