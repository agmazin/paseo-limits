import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createPaseoClient } from '@getpaseo/client';
import WebSocket from 'ws';
const { _electron } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const dir = await mkdtemp(join(tmpdir(), 'limits-providers-'));
const home = join(dir, 'home');
const source = resolve('.');
const host = '127.0.0.1:6798';
const cli = '/Users/agmazin/Library/Developer/paseo-cli012/node_modules/@getpaseo/cli/dist/index.js';
const report = { host, home, checks: [] };
await mkdir(home);
for (const folder of ['agents', 'projects', 'creations']) {
  await cp('/Users/agmazin/Library/Developer/paseo-tabs/split-home/' + folder, join(home, folder), { recursive: true });
}
const date = new Date().toISOString();
const quota = { windows: [{ windowSeconds: 604800, usedPercent: 27, resetsAt: new Date(Date.now()+3600000).toISOString() }] };
const fixture = join(dir, 'limits.json');
await writeFile(fixture, JSON.stringify({ fetchedAt: date, testData: true, claude: quota, codex: quota }));
await writeFile(join(home, 'config.json'), JSON.stringify({ daemon: { listen: host, relay: { enabled: false } }, pluginsEnabled: true, plugins: { 'paseo-limits': { source: 'directory', path: source, enabled: true } }, features: { webUi: { enabled: true } }, agents: { providers: { claude: { enabled: false }, codex: { enabled: true } } } }));
let electron, client;
const daemon = spawn('node', [cli, 'daemon', 'run', '--home', home], { env: { ...process.env, PASEO_LIMITS_FILE: fixture }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
daemon.stdout.on('data', chunk => { logs += chunk; });
daemon.stderr.on('data', chunk => { logs += chunk; });
try {
  for (let i=0; i<100; i++) {
    try { const response = await fetch('http://' + host + '/'); if (response.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const credential = (await readFile(join(home, 'local-credential'), 'utf8')).trim();
  for (let i=0; i<40; i++) {
    client = createPaseoClient({ url: 'ws://' + host + '/ws', localCredential: () => credential,
      webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, {headers: options?.headers}),
      connectTimeoutMs: 2000, reconnect: { enabled: false } });
    try { await client.connect(); break; } catch (error) {
      await client.close();
      if (i===39) throw error;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  const config = await client.config.get();
  assert.equal(config.config.providers.claude.enabled, false);
  report.configShape = { claude: config.config.providers.claude.enabled, codex: config.config.providers.codex.enabled };
  report.availability = (await client.providers.listAvailable()).providers;
  electron = await _electron.launch({ executablePath: '/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron', args: [resolve('tests/browser/split-host.cjs')], env: { ...process.env, LIMITS_TEST_HOME: home, LIMITS_TEST_PROFILE: join(dir, 'profile'), LIMITS_TEST_HOST: host } });
  const page = await electron.firstWindow();
  page.setDefaultTimeout(20000);
  await page.addInitScript(({host}) => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native { constructor(url, ...args) { super(String(url).replace(/(?:localhost|127\.0\.0\.1):6786/g, host), ...args); } };
    const nativeFetch = window.fetch;
    window.fetch = (url, ...args) => nativeFetch(typeof url === 'string' ? url.replace(/(?:localhost|127\.0\.0\.1):6786/g, host) : url, ...args);
  }, {host});
  await page.goto('paseo://app/');
  await page.waitForTimeout(2500);
  await page.locator('[data-testid^="sidebar-workspace-row-"][data-testid*="wks_15d690ea2b3bfb2f"]').click();
  await page.waitForTimeout(1200);
  await page.getByText('CTG-30: Повтор архивации 0.9', {exact:true}).last().click();
  await page.waitForSelector('[data-paseo-limits]');
  const check = async (name, claude) => {
    await page.waitForFunction(claude => {
      const row = document.querySelector('[data-paseo-limits]');
      return row && !!row.querySelector('[aria-label="Claude"]') === claude && !!row.querySelector('[aria-label="Codex"]');
    }, claude);
    report.checks.push(name);
    await page.screenshot({path: join(dir, name+'.png')});
    console.log('PASS', name);
  };
  await check('disabled-inline', false);
  await page.getByRole('button', {name:'Обновить лимиты',exact:true}).first().click();
  await check('disabled-after-refresh', false);
  await client.config.patch({providers:{claude:{enabled:true}}});
  await check('reenabled-without-reload', true);
  await client.config.patch({providers:{claude:{enabled:false}}});
  await check('disabled-without-reload', false);
  await client.config.patch({providers:{codex:{enabled:false}}});
  await page.waitForFunction(() => [...document.querySelectorAll('[data-paseo-limits]')].every(n => n.getBoundingClientRect().height === 0 && n.textContent === ''));
  report.checks.push('both-disabled-no-empty-row');
  await page.screenshot({path:join(dir,'both-disabled.png')});
  await client.config.patch({providers:{codex:{enabled:true}}});
  await check('codex-reenabled', false);
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(390,844));
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('[data-testid="message-input-root"]').forEach(n=>n.removeAttribute('data-testid')));
  await page.waitForTimeout(500);
  await page.getByText(/Codex 27% использовано/).first().click();
  await page.getByRole('button', {name:'Обновить лимиты',exact:true}).click();
  await page.waitForTimeout(300);
  assert(!(await page.locator('body').innerText()).includes('Claude'));
  assert(await page.getByText('Codex', {exact:true}).last().isVisible());
  report.checks.push('disabled-pill-and-popover');
  await page.screenshot({path:join(dir,'compact.png')});
  assert.equal(JSON.parse(await readFile(fixture,'utf8')).claude.windows[0].usedPercent,27);
  report.checks.push('source-snapshot-intact');
} catch (error) {
  if (electron) { const p = await electron.firstWindow(); console.error('FAILURE BODY', (await p.locator('body').innerText()).slice(-3000)); await p.screenshot({path:join(dir,'failure.png')}); }
  throw error;
} finally {
  await electron?.close();
  await client?.close();
  const exit = once(daemon, 'exit');
  daemon.kill('SIGTERM');
  await exit;
  await writeFile(join(dir, 'daemon.log'),logs);
  await writeFile(join(dir, 'report.json'),JSON.stringify(report,null,2));
  console.log('EVIDENCE',dir);
}
