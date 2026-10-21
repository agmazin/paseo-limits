import { providerPaths } from "./provider-paths";
import { Platform } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { LimitsState } from "./state";
import {
  left,
  stale,
  tone,
  tooltip,
  windowName,
  windows,
} from "../shared/model";
// Only this adapter touches DOM. Native clients use the registered composer pill.
interface Element {
  style: { cssText: string; setProperty(k: string, v: string): void };
  className: string;
  textContent: string | null;
  innerHTML: string;
  isConnected: boolean;
  parentElement: Element | null;
  nextElementSibling: Element | null;
  clientWidth: number;
  scrollWidth: number;
  getAttribute(k: string): string | null;
  setAttribute(k: string, v: string): void;
  querySelector(s: string): Element | null;
  querySelectorAll(s: string): Iterable<Element>;
  append(...nodes: Element[]): void;
  after(n: Element): void;
  remove(): void;
  contains(n: Element): boolean;
  getBoundingClientRect(): {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
  addEventListener(event: string, fn: () => void): void;
}
declare const document: {
  createRange(): {
    selectNodeContents(n: Element): void;
    getBoundingClientRect(): { top: number; bottom: number; height: number };
  };
  fonts?: {
    addEventListener(e: string, f: () => void): void;
    removeEventListener(e: string, f: () => void): void;
  };
  body: Element;
  head: Element;
  createElement(tag: string): Element;
  querySelectorAll(s: string): Iterable<Element>;
};
declare function getComputedStyle(n: Element): {
  rowGap: string;
  columnGap: string;
  marginTop: string;
  marginLeft: string;
  marginRight: string;
  font: string;
  paddingBottom: string;
  marginBottom: string;
};
declare const window: {
  innerWidth: number;
  innerHeight: number;
  addEventListener(e: string, f: () => void): void;
  removeEventListener(e: string, f: () => void): void;
};
declare function requestAnimationFrame(fn: () => void): number;
declare function cancelAnimationFrame(id: number): void;
declare const MutationObserver: new (
  fn: (records: { target: Element }[]) => void,
) => { observe(n: Element, o: object): void; disconnect(): void };
declare const ResizeObserver: new (fn: () => void) => {
  observe(n: Element): void;
  unobserve(n: Element): void;
  disconnect(): void;
};
const css = `
.pl-limits.narrow.stale:not(.demo-data){height:40px;flex-wrap:wrap;row-gap:0}.pl-limits.narrow.stale .note:not(.demo){flex-basis:100%;margin:0;text-align:right}

.pl-limits.demo-data{height:40px;flex-wrap:wrap;row-gap:0}.pl-limits .demo{flex-basis:100%;margin:0;text-align:right}.pl-limits.narrow .left{display:none}

.pl-limits{position:relative;display:flex;align-items:center;gap:18px;height:20px;min-height:20px;margin:12px 0;padding:0 6px;font:13px/20px -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;color:var(--pl-fg2);white-space:nowrap;box-sizing:border-box;-webkit-font-smoothing:antialiased;flex-shrink:0}
.pl-limits *{box-sizing:border-box}.pl-limits > :not(.tip){flex-shrink:0}.pl-limits.medium{gap:14px}.pl-limits.medium .win{gap:6px}.pl-limits.medium .bar{width:56px}.pl-limits.narrow{gap:12px}.pl-limits.stale .win,.pl-limits.stale .lg-prov,.pl-limits.stale .vsep{opacity:.45}
.pl-limits .refresh{margin:-2px -6px -2px -4px;width:24px;height:24px;border-radius:7px;border:0;background:transparent;color:var(--pl-fg3);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 24px;padding:0}
.pl-limits .refresh:hover,.pl-limits .refresh.hot{background:var(--pl-raised);color:var(--pl-fg)}
.pl-limits .ico{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.pl-limits .refresh.spin .ico{animation:pl-spin .8s linear infinite}@keyframes pl-spin{to{transform:rotate(360deg)}}
.pl-limits .lg-prov{color:var(--pl-provider);display:inline-flex;align-items:center}.pl-limits .logo{width:16px;height:16px;fill:currentColor}.pl-limits .win{display:inline-flex;align-items:center;gap:8px;cursor:default}
.pl-limits .bar{width:80px;height:6px;border-radius:3px;background:#2a2a2a;overflow:hidden}.pl-limits.narrow .bar{display:none}
.pl-limits .bar i{display:block;height:100%;border-radius:3px;background:#3f8f6a;transition:width .4s ease,background .3s}.pl-limits .bar i.warn{background:#c98a2e}.pl-limits .bar i.bad{background:#d9534f}
.pl-limits .pct{color:var(--pl-fg);font-variant-numeric:tabular-nums}.pl-limits .pct.warn{color:#e2a64a}.pl-limits .pct.bad{color:#ef7a76}
.pl-limits .left{color:var(--pl-fg3);font-variant-numeric:tabular-nums}.pl-limits .vsep{width:1px;min-width:1px;height:16px;background:var(--pl-border)}
.pl-limits .note{color:var(--pl-fg3);font-size:12px;margin-left:auto}
.pl-limits .tip{position:absolute;bottom:22px;left:0;background:var(--pl-raised);border:1px solid var(--pl-border);border-radius:9px;padding:8px 11px;font-size:12.5px;color:var(--pl-fg);white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s;pointer-events:none;z-index:5;line-height:1.35}
.pl-limits .tip.show{opacity:1;transform:none}
`;
const icon =
  '<svg class="ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';
function node(tag: string, cls: string, text?: string) {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
export function mountRows(
  state: LimitsState,
  theme: PluginTheme,
  compact: boolean,
  onAvailability: (agents: Set<string>) => void,
) {
  if (Platform.OS !== "web") return () => {};
  const style = node("style", "");
  style.textContent = css;
  document.head.append(style);
  const rows = new Map<Element, Element>();
  let disposed = false;
  let frame: number | null = null;
  const canvas = document.createElement("canvas") as unknown as {
    getContext(kind: string): {
      font: string;
      measureText(text: string): {
        fontBoundingBoxDescent: number;
        actualBoundingBoxAscent: number;
        actualBoundingBoxDescent: number;
      };
    };
  };
  const context = canvas.getContext("2d");
  const textBounds = (row: Element) => {
    // A 20px line box is larger than visible 13px glyphs. Measure the ink,
    // otherwise an apparent symmetric 13px gap can pass an 8px box assertion.
    let top = Infinity,
      bottom = -Infinity;
    for (const el of row.querySelectorAll(
      ".lg-prov,.window-name,.pct,.left,.note",
    )) {
      if (!el.textContent) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      context.font = getComputedStyle(el).font;
      const metrics = context.measureText(el.textContent);
      const baseline = rect.bottom - metrics.fontBoundingBoxDescent;
      top = Math.min(top, baseline - metrics.actualBoundingBoxAscent);
      bottom = Math.max(bottom, baseline + metrics.actualBoundingBoxDescent);
    }
    return Number.isFinite(top) && Number.isFinite(bottom)
      ? { top, bottom }
      : row.getBoundingClientRect();
  };
  const textGap = 12;
  const align = (root: Element, row: Element) => {
    let pane: Element | null = root.parentElement;
    while (
      pane &&
      !pane.getAttribute("data-testid")?.startsWith("workspace-pane-")
    )
      pane = pane.parentElement;
    for (let pass = 0; pass < 3; pass++) {
      const text = textBounds(row);
      const topGap = text.top - root.getBoundingClientRect().bottom;
      const bottomGap =
        Math.min(
          pane?.getBoundingClientRect().bottom ?? window.innerHeight,
          window.innerHeight,
        ) - text.bottom;
      if (Math.abs(topGap - textGap) < 0.1 && Math.abs(bottomGap - textGap) < 0.1) break;
      const style = getComputedStyle(row);
      row.style.setProperty(
        "margin-top",
        `${(parseFloat(style.marginTop) || 0) + textGap - topGap}px`,
      );
      row.style.setProperty(
        "margin-bottom",
        `${(parseFloat(style.marginBottom) || 0) + textGap - bottomGap}px`,
      );
    }
  };
  const render = (root: Element, row: Element) => {
    const { data, busy, now } = state.get();
    // The composer, not the injected flex item's pre-layout size, is the budget.
    const width = root.getBoundingClientRect().width;
    row.style.setProperty("width", `${width}px`);
    row.style.setProperty("min-width", `${width}px`);
    const groups = windows(data);
    const old = stale(data, now);
    // Foreground blends follow the active host theme, including light themes.
    row.style.setProperty("--pl-fg", theme.colors.foreground);
    row.style.setProperty("--pl-fg2", theme.colors.foregroundMuted);
    row.style.setProperty(
      "--pl-fg3",
      `color-mix(in srgb, ${theme.colors.foregroundMuted} 60.4%, ${theme.colors.surface0})`,
    );
    row.style.setProperty(
      "--pl-provider",
      `color-mix(in srgb, ${theme.colors.foreground} 69%, ${theme.colors.foregroundMuted})`,
    );
    row.style.setProperty("--pl-raised", theme.colors.surface1);
    row.style.setProperty("--pl-border", theme.colors.border);
    const draw = (mode: "full" | "medium" | "narrow") => {
      row.className = `pl-limits ${mode}${old ? " stale" : ""}${data?.testData ? " demo-data" : ""}`;
      row.innerHTML = "";
      const refresh = node(
        "button",
        `refresh${old ? " hot" : ""}${busy ? " spin" : ""}`,
      );
      refresh.setAttribute("aria-label", "Обновить лимиты");
      refresh.setAttribute("type", "button");
      if (busy) refresh.setAttribute("disabled", "");
      refresh.innerHTML = icon;
      refresh.addEventListener("click", () => void state.refresh());
      row.append(refresh);
      const tip = node("span", "tip");
      tip.setAttribute("role", "tooltip");
      groups.forEach((p, i) => {
        if (i) row.append(node("span", "vsep"));
        const provider = node("span", "lg-prov");
        provider.setAttribute("title", p.name);
        provider.setAttribute("aria-label", p.name);
        provider.innerHTML = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"${p.name === "Codex" ? ' fill-rule="evenodd"' : ""}><path d="${providerPaths[p.name.toLowerCase()]}"/></svg>`;
        row.append(provider);
        p.windows.forEach((w) => {
          const win = node("span", "win");
          win.setAttribute("tabindex", "0");
          const text = tooltip(p.name, w, now);
          win.setAttribute("aria-label", text);
          const bar = node("span", "bar");
          const fill = node("i", tone(w.usedPercent));
          fill.style.cssText = `width:${Math.max(w.usedPercent, 2)}%`;
          bar.append(fill);
          win.append(
            node("span", "window-name", windowName(w.windowSeconds, mode !== "full")),
            bar,
            node("span", `pct ${tone(w.usedPercent)}`, `${100-w.usedPercent}%`),
            node("span", "left", `· ${left(w.resetsAt, now)}`),
          );
          const show = () => {
            tip.textContent = text;
            tip.className = "tip show";
            tip.style.setProperty(
              "left",
              `${Math.max(0, Math.min(win.getBoundingClientRect().left - row.getBoundingClientRect().left - 6, row.clientWidth - tip.getBoundingClientRect().width))}px`,
            );
          };
          const hide = () => {
            tip.className = "tip";
          };
          win.addEventListener("mouseenter", show);
          win.addEventListener("mouseleave", hide);
          win.addEventListener("focus", show);
          win.addEventListener("blur", hide);
          row.append(win);
        });
      });
      if (data && old && !data.testData)
        row.append(
          node(
            "span",
            "note",
            `данные от ${new Date(data.fetchedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
          ),
        );
      if (!groups.length)
        row.append(node("span", "note", "Данные пока недоступны"));
      if(data?.testData)row.append(node("span","note demo",old ? `Тестовые данные от ${new Date(data.fetchedAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}` : "Тестовые данные"));
      row.append(tip);
    };
    for (const mode of ["full", "medium", "narrow"] as const) {
      draw(mode);
      // Exclude the absolutely positioned tooltip and prevent child flex shrink.
      const children = [...row.querySelectorAll(":scope > :not(.tip):not(.demo)")];
      const needed =
        12 +
        Math.max(0, children.length - 1) *
          (parseFloat(getComputedStyle(row).columnGap) || 0) +
        children.reduce((sum, child) => {
          const style = getComputedStyle(child);
          return (
            sum +
            child.getBoundingClientRect().width +
            (parseFloat(style.marginLeft) || 0) +
            (parseFloat(style.marginRight) || 0)
          );
        }, 0);
      if (needed <= width + 0.5) break;
    }
    if(compact || data?.testData){
      row.style.setProperty("margin-top","12px");
      row.style.setProperty("margin-bottom","12px");
    } else align(root, row);
  };
  const scan = () => {
    if (disposed) return;
    const roots = [
          ...document.querySelectorAll('[data-testid="message-input-root"]'),
        ].filter((r) => r.getBoundingClientRect().width > 0);
    for (const [root, row] of rows)
      if (!roots.includes(root) || !row.isConnected) {
        row.remove();
        resize.unobserve(root);
        rows.delete(root);
      }
    for (const root of roots) {
      let row = rows.get(root);
      if (!row) {
        row = node("div", "pl-limits");
        row.setAttribute("data-paseo-limits", "");
        root.after(row);
        rows.set(root, row);
        resize.observe(root);
        render(root, row);
      }
    }
    const agents = new Set<string>();
    for (const root of rows.keys()) {
      for (let p = root.parentElement; p; p = p.parentElement) {
        if (!p.getAttribute("data-testid")?.startsWith("workspace-pane-"))
          continue;
        for (const tab of p.querySelectorAll(
          '[data-testid^="workspace-tab-agent_"][aria-selected="true"]',
        )) {
          agents.add(
            tab
              .getAttribute("data-testid")!
              .slice("workspace-tab-agent_".length),
          );
        }
        break;
      }
    }
    if(compact && rows.size)agents.add("*");
    onAvailability(agents);
  };
  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (disposed) return;
      scan();
      for (const [root, row] of rows) render(root, row);
    });
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          ![...rows.values()].some(
            (row) => row === r.target || row.contains(r.target),
          ),
      )
    )
      schedule();
  });
  const resize = new ResizeObserver(schedule);
  resize.observe(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-testid", "aria-selected"],
  });
  const unsubscribe = state.subscribe(schedule);
  window.addEventListener("resize", schedule);
  document.fonts?.addEventListener("loadingdone", schedule);
  schedule();
  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    document.fonts?.removeEventListener("loadingdone", schedule);
    observer.disconnect();
    resize.disconnect();
    unsubscribe();
    window.removeEventListener("resize", schedule);
    for (const row of rows.values()) row.remove();
    style.remove();
    onAvailability(new Set());
  };
}
