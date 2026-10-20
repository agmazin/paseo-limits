// Uses the production web adapter in Chromium; Playwright lives outside the repo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ts = require("typescript");
const fs = require("node:fs");
const cp = require("node:child_process");
const assert = require("node:assert/strict");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
function compile(source) {
  return ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ES2020,
      },
    })
    .outputText.replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
    .replace(/export /g, "");
}
const model = compile(fs.readFileSync("shared/model.ts", "utf8"));
const old = cp.execFileSync("git", ["show", "a9cd2f8:client/web.ts"], {
  encoding: "utf8",
});
// Historical geometry regression: compare the two pre-logo revisions.
const now = cp.execFileSync("git", ["show", "ce5ba6e:client/web.ts"], { encoding: "utf8" });
const data = {
  fetchedAt: new Date().toISOString(),
  claude: {
    windows: [
      {
        windowSeconds: 18000,
        usedPercent: 27,
        resetsAt: new Date(Date.now() + 13680000).toISOString(),
      },
      {
        windowSeconds: 604800,
        usedPercent: 13,
        resetsAt: new Date(Date.now() + 360000000).toISOString(),
      },
    ],
  },
  codex: {
    windows: [
      {
        windowSeconds: 604800,
        usedPercent: 5,
        resetsAt: new Date(Date.now() + 550000000).toISOString(),
      },
    ],
  },
};
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  try {
    for (const version of ["before", "after"])
      for (const width of [1710, 1280, 980])
        for (const constrained of [false, true]) {
          const p = await b.newPage({
            viewport: { width, height: 1068 },
            deviceScaleFactor: 1,
          });
          const errors = [];
          p.on("pageerror", (e) => errors.push(e.message));
          await p.setContent(
            `<style>*{box-sizing:border-box}body{margin:0;background:#1b1b1b;color:#ececec}.pane{margin-left:320px;height:100vh;display:flex;flex-direction:column}.space{flex:1}.dock{display:flex;flex-direction:column;align-items:center;padding:0 16px 16px}.inner{display:flex;flex-direction:column;gap:12px;width:100%;max-width:1150px}.input{width:100%;height:116px;border:1px solid #333;border-radius:14px}.electron-inset{height:10px;flex-shrink:0}${constrained ? ".pl-limits{max-width:600px}" : ""}</style><div class="pane" data-testid="workspace-pane-main"><div class="space"></div><div class="dock"><div class="inner"><div class="input" data-testid="message-input-root"></div></div></div>${constrained ? '<div class="electron-inset"></div>' : ""}</div>`,
          );
          await p.addScriptTag({
            content: `const Platform={OS:'web'};${model}\n${compile(version === "before" ? old : now)}\nconst state={get:()=>({data:${JSON.stringify(data)},busy:false,now:Date.now()}),subscribe:()=>()=>{},refresh:async()=>{}};globalThis.cleanup=mountRows(state,{colors:{foreground:'#ececec',foregroundMuted:'#a6a6a6',surface0:'#1b1b1b',surface1:'#262626',border:'#333'}},false,()=>{});`,
          });
          await p.waitForTimeout(150);
          const measure = () =>
            p.evaluate(() => {
              const row = document.querySelector(".pl-limits"),
                root = document.querySelector(
                  '[data-testid="message-input-root"]',
                ),
                ctx = document.createElement("canvas").getContext("2d");
              let top = Infinity,
                bottom = -Infinity;
              for (const e of row.querySelectorAll(
                ".lg-prov,.window-name,.pct,.left,.note",
              )) {
                const r = document.createRange();
                r.selectNodeContents(e);
                ctx.font = getComputedStyle(e).font;
                const m = ctx.measureText(e.textContent),
                  base =
                    r.getBoundingClientRect().bottom - m.fontBoundingBoxDescent;
                top = Math.min(top, base - m.actualBoundingBoxAscent);
                bottom = Math.max(bottom, base + m.actualBoundingBoxDescent);
              }
              return {
                fieldWidth: root.getBoundingClientRect().width,
                rowWidth: row.getBoundingClientRect().width,
                narrow: row.classList.contains("narrow"),
                topGap: top - root.getBoundingClientRect().bottom,
                bottomGap: innerHeight - bottom,
                barWidth: row.querySelector(".bar").getBoundingClientRect()
                  .width,
              };
            });
          const m = await measure();
          results.push({ version, viewport: width, constrained, ...m });
          await p.screenshot({
            path: `${out}/${version}-${width}-${constrained}.png`,
            clip: { x: 320, y: 880, width: width - 320, height: 188 },
          });
          if (version === "after") {
            assert.equal(m.rowWidth, m.fieldWidth);
            assert.ok(Math.abs(m.topGap - 8) < 0.2);
            assert.ok(Math.abs(m.bottomGap - 8) < 0.2);
            assert.equal(m.narrow, width === 980);
            if (!m.narrow) assert.equal(m.barWidth, 80);
            await p.setViewportSize({ width: 980, height: 900 });
            await p.waitForTimeout(100);
            assert.equal((await measure()).narrow, true);
            await p.setViewportSize({ width: 1710, height: 1068 });
            await p.waitForTimeout(100);
            assert.equal((await measure()).narrow, false);
            await p.evaluate(() => cleanup());
            assert.equal(await p.locator(".pl-limits").count(), 0);
            assert.deepEqual(errors, []);
          }
          await p.close();
        }
    fs.writeFileSync(out + "/layout.json", JSON.stringify(results, null, 2));
    console.log(results);
  } finally {
    await b.close();
  }
})();
