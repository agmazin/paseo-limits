// PLAYWRIGHT_MODULE points to an installed Playwright package outside the synced repo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const out = process.argv[2];
if (!out) throw Error("Pass external evidence directory");
fs.mkdirSync(out, { recursive: true });
const base = path.dirname(out),
  now = "2026-10-20T10:22:00Z";
const fixture = (hot = false, old = false) => ({
  claude: {
    windows: [
      {
        windowSeconds: 18000,
        usedPercent: hot ? 91 : 27,
        resetsAt: "2026-10-20T14:10:00Z",
      },
      {
        windowSeconds: 604800,
        usedPercent: hot ? 74 : 13,
        resetsAt: "2026-10-24T16:00:00Z",
      },
    ],
  },
  codex: {
    windows: [
      {
        windowSeconds: 604800,
        usedPercent: hot ? 12 : 5,
        resetsAt: "2026-10-27T08:15:29Z",
      },
    ],
  },
  fetchedAt: old ? "2026-10-20T10:08:20Z" : now,
});
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const measurements = [];
  const errors = [];
  try {
    for (const scenario of [
      "normal",
      "hot",
      "narrow",
      "stale",
      "busy",
      "tooltip",
    ]) {
      fs.writeFileSync(
        path.join(base, "visual-plugin/fixture.json"),
        JSON.stringify(fixture(scenario === "hot", scenario === "stale")),
      );
      const ctx = await browser.newContext({
        storageState: path.join(base, "browser-state.json"),
        viewport: { width: scenario === "narrow" ? 980 : 1480, height: 900 },
        deviceScaleFactor: 1,
        timezoneId: "Europe/Moscow",
      });
      const actual = await ctx.newPage();
      actual.on("pageerror", (e) => errors.push(e.message));
      await actual.clock.setFixedTime(new Date(now));
      await actual.goto("http://127.0.0.1:6783");
      await actual.locator(".pl-limits .win").first().waitFor();
      await actual.waitForTimeout(600);
      await actual.addStyleTag({ content: ".pl-limits{background:#1b1b1b}" });
      const m = await actual.locator(".pl-limits").evaluate((row) => {
        const b = row.getBoundingClientRect(),
          r = row.previousElementSibling.getBoundingClientRect();
        const ctx = document.createElement("canvas").getContext("2d");
        let top = Infinity,
          bottom = -Infinity;
        for (const el of row.querySelectorAll(
          ".lg-prov,.window-name,.pct,.left,.note",
        )) {
          const range = document.createRange();
          range.selectNodeContents(el);
          ctx.font = getComputedStyle(el).font;
          const m = ctx.measureText(el.textContent);
          const baseline =
            range.getBoundingClientRect().bottom - m.fontBoundingBoxDescent;
          top = Math.min(top, baseline - m.actualBoundingBoxAscent);
          bottom = Math.max(bottom, baseline + m.actualBoundingBoxDescent);
        }
        return {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          topGap: top - r.bottom,
          bottomGap: innerHeight - bottom,
          narrow: row.classList.contains("narrow"),
          barWidth: row.querySelector(".bar").getBoundingClientRect().width,
          font: getComputedStyle(row).fontSize,
        };
      });
      assert.ok(Math.abs(m.topGap - 8) < 0.2);
      assert.ok(Math.abs(m.bottomGap - 8) < 0.2);
      assert.equal(m.narrow, scenario === "narrow");
      measurements.push({ scenario, ...m });
      const proto = await ctx.newPage();
      await proto.setViewportSize({ width: 1600, height: 900 });
      await proto.clock.setFixedTime(new Date(now));
      await proto.goto("file://" + path.resolve("prototype/v1.html"));
      await proto.addStyleTag({
        content: ".stage{max-width:none}.window{transition:none}",
      });
      await proto.evaluate(
        ({ scenario, width }) => {
          state.hot = scenario === "hot";
          state.stale = scenario === "stale";
          state.narrow = scenario === "narrow";
          state.busy = scenario === "busy";
          SNAP.fetchedAt = "2026-10-20T10:08:20Z";
          render();
          document.getElementById("win").style.width =
            width + (state.narrow ? 240 + 36 : 340 + 96) + 2 + "px";
        },
        { scenario, width: m.width },
      );
      // Normalize only the approved spacing; the prototype CSS is otherwise unchanged.
      await proto.addStyleTag({
        content:
          ".limits{margin-top:8px!important;margin-bottom:8px!important}",
      });
      if (scenario === "busy") {
        await actual
          .getByRole("button", { name: "Обновить лимиты", exact: true })
          .click();
        await actual.locator(".refresh.spin").waitFor();
        await actual.mouse.move(0, 0);
        assert.notEqual(
          await actual
            .locator(".refresh .ico")
            .evaluate((e) => getComputedStyle(e).animationName),
          "none",
        );
        for (const p of [actual, proto])
          await p.addStyleTag({
            content:
              ".refresh.spin .ico{animation:none!important;transform:rotate(45deg)}",
          });
      }
      if (scenario === "tooltip") {
        await actual.locator(".pl-limits .win").first().hover();
        await proto.locator(".limits .win").first().hover();
        await actual.waitForTimeout(180);
      }
      const capture = async (p, selector, file) => {
        const r = await p.locator(selector).boundingBox();
        await p.screenshot({
          path: path.join(out, file),
          clip: { x: r.x - 4, y: r.y - 64, width: r.width + 8, height: 96 },
        });
      };
      await capture(actual, ".pl-limits", scenario + "-actual.png");
      await capture(proto, ".limits", scenario + "-prototype.png");
      await ctx.close();
    }
    fs.writeFileSync(
      path.join(out, "measurements.json"),
      JSON.stringify({ measurements, errors }, null, 2),
    );
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ scenarios: measurements.length, errors }));
  } finally {
    await browser.close();
  }
})();
