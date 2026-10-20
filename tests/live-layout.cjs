const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const base = process.argv[2];
(async () => {
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const state = JSON.parse(fs.readFileSync(base + "/browser-state.json"));
    for (const x of state.origins[0].localStorage)
      if (x.name === "@paseo:app-settings") {
        const v = JSON.parse(x.value);
        v.contentMaxWidth = 1150;
        x.value = JSON.stringify(v);
      }
    const p = await b.newPage({
      storageState: state,
      viewport: { width: 1710, height: 1068 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://127.0.0.1:6783");
    await p.getByText("Проверка отступов", { exact: true }).first().click();
    await p.getByText("Агент", { exact: true }).click();
    await p.locator(".pl-limits .win").first().waitFor();
    const results = [];
    for (const width of [1710, 1280, 980, 1710]) {
      await p.setViewportSize({ width, height: 1068 });
      await p.waitForTimeout(250);
      const m = await p.locator(".pl-limits").evaluate((row) => {
        const root = row.previousElementSibling,
          ctx = document.createElement("canvas").getContext("2d");
        let top = Infinity,
          bottom = -Infinity;
        for (const e of row.querySelectorAll(
          ".lg-prov,.window-name,.pct,.left,.note",
        )) {
          const r = document.createRange();
          r.selectNodeContents(e);
          ctx.font = getComputedStyle(e).font;
          const t = ctx.measureText(e.textContent),
            base = r.getBoundingClientRect().bottom - t.fontBoundingBoxDescent;
          top = Math.min(top, base - t.actualBoundingBoxAscent);
          bottom = Math.max(bottom, base + t.actualBoundingBoxDescent);
        }
        return {
          field: root.getBoundingClientRect().width,
          row: row.getBoundingClientRect().width,
          topGap: top - root.getBoundingClientRect().bottom,
          bottomGap: innerHeight - bottom,
          narrow: row.classList.contains("narrow"),
          barWidth: row.querySelector(".bar").getBoundingClientRect().width,
        };
      });
      assert.equal(m.field, m.row);
      assert.ok(Math.abs(m.topGap - 8) < 0.2);
      assert.ok(Math.abs(m.bottomGap - 8) < 0.2);
      assert.equal(m.narrow, width === 980);
      results.push({ viewport: width, ...m });
      await p.screenshot({
        path: base + "/review-evidence/live-" + width + ".png",
      });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      base + "/review-evidence/live-layout.json",
      JSON.stringify({ results, errors }, null, 2),
    );
    console.log(results);
  } finally {
    await b.close();
  }
})();
