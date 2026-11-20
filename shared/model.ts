export interface LimitWindow {
  windowSeconds: number;
  usedPercent: number;
  resetsAt: string;
}
export interface Snapshot {
  testData?: boolean;
  personal?: boolean;
  claude?: { windows: LimitWindow[] };
  codex?: { windows: LimitWindow[] };
  // DeepSeek sells no subscription windows: the company account balance is shown instead.
  deepseek?: DeepseekBalance;
  fetchedAt: string;
}
export interface DeepseekBalance {
  currency: "USD" | "CNY";
  balance: number;
  spent?: number;
}
const money = (v: number) => v.toFixed(2).replace(".", ",");
export const balanceText = (b: DeepseekBalance) =>
  b.currency === "USD" ? `$${money(b.balance)}` : `${money(b.balance)} юаней`;
export const balanceTone = (b: DeepseekBalance) =>
  b.balance < 0.1 ? "bad" : b.balance < 0.5 ? "warn" : "";
export const balanceTooltip = (b: DeepseekBalance) =>
  `DeepSeek: на балансе ${money(b.balance)} ${b.currency === "USD" ? "долларов" : "юаней"}` +
  (b.spent !== undefined ? `, потрачено ${money(b.spent)}` : "");
export function windows(s: Snapshot | null) {
  return (["claude", "codex"] as const).flatMap((key) => {
    const list =
      s?.[key]?.windows.filter((w) =>
        (key === "claude" || s?.personal)
          ? [18000, 604800].includes(w.windowSeconds)
          : w.windowSeconds === 604800,
      ) ?? [];
    return list.length
      ? [
          {
            key,
            name: key === "claude" ? "Claude" : "Codex",
            windows: [...list].sort(
              (a, b) => a.windowSeconds - b.windowSeconds,
            ),
          },
        ]
      : [];
  });
}
export const tone = (p: number) => (p >= 90 ? "bad" : p >= 70 ? "warn" : "");
export const color = (p: number) =>
  p >= 90 ? "#d9534f" : p >= 70 ? "#c98a2e" : "#3f8f6a";
export const stale = (s: Snapshot | null, now = Date.now()) =>
  !s || now - Date.parse(s.fetchedAt) > 600000;
export const windowName = (s: number, narrow = false) =>
  s === 18000 ? (narrow ? "5ч" : "сессия") : narrow ? "нед" : "неделя";
export function left(iso: string, now = Date.now()) {
  let m = Math.max(0, Math.round((Date.parse(iso) - now) / 60000));
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  return d ? `${d}д ${h}ч` : h ? `${h}ч ${m}м` : `${m}м`;
}
export function exact(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return d.toDateString() === new Date(now).toDateString()
    ? `сегодня в ${hm}`
    : `${["вс", "пн", "вт", "ср", "чт", "пт", "сб"][d.getDay()]} ${d.getDate()} ${["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][d.getMonth()]} в ${hm}`;
}
export const label = (s: Snapshot | null) =>
  (s?.personal ? "Мои лимиты · " : "") + [
    ...windows(s).map(
      (p) =>
        `${p.name} ${p.windows.map((w) => `${w.usedPercent}% использовано`).join(" · ")}`,
    ),
    ...(s?.deepseek ? [`DeepSeek ${balanceText(s.deepseek)}`] : []),
  ].join(" | ") || "Лимиты недоступны";
export const tooltip = (name: string, w: LimitWindow, now = Date.now()) =>
  `${name}, ${windowName(w.windowSeconds)}: ${w.usedPercent}% использовано, сброс ${exact(w.resetsAt, now)}`;
