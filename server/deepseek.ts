import type { DeepseekBalance } from "../shared/model";
// Balance of the DeepSeek account signed in to DeepSeek Harness (dsh). The same sign-in that pays for
// DeepSeek agents reads its wallet; no API key. The token is never logged or returned to clients.
export function accountToken(credentialsYaml: string): string | null {
  const start = credentialsYaml.indexOf("deepseek-account-platform/default:");
  if (start < 0) return null;
  const block = credentialsYaml.slice(start).split(/\n(?=  \S)/)[0];
  const match = /\n\s+token:\s*["']?([^\s"']+)/.exec(block);
  return match ? match[1] : null;
}
interface Wallet { currency: string; balance: string }
export function fromSummary(body: unknown): DeepseekBalance | null {
  const data = (body as { code?: number; data?: { biz_code?: number; biz_data?: { normal_wallets?: Wallet[]; bonus_wallets?: Wallet[]; total_costs?: { currency: string; amount: string }[] } } })?.data;
  if ((body as { code?: number })?.code !== 0 || data?.biz_code !== 0 || !data.biz_data) return null;
  const wallets = [...(data.biz_data.normal_wallets ?? []), ...(data.biz_data.bonus_wallets ?? [])];
  const currency = wallets.find((w) => Number(w.balance) > 0)?.currency ?? wallets[0]?.currency;
  if (currency !== "USD" && currency !== "CNY") return null;
  const sum = (rows: { currency: string; value: string }[]) =>
    rows.filter((r) => r.currency === currency).reduce((total, r) => total + Number(r.value), 0);
  const balance = sum(wallets.map((w) => ({ currency: w.currency, value: w.balance })));
  if (!Number.isFinite(balance)) return null;
  const costs = data.biz_data.total_costs;
  const spent = costs ? sum(costs.map((c) => ({ currency: c.currency, value: c.amount }))) : undefined;
  return { currency, balance, ...(spent !== undefined && Number.isFinite(spent) && spent >= 0 ? { spent } : {}) };
}
export function deepseekReader(
  readCredentials: () => Promise<string>,
  fetchSummary: (token: string) => Promise<unknown>,
  now = Date.now,
) {
  let last = -Infinity;
  type DatedBalance = DeepseekBalance & { fetchedAt: string };
  let cached: DatedBalance | null = null;
  let pending: Promise<DatedBalance | null> | undefined;
  return () => {
    if (now() - last < 60000) return Promise.resolve(cached);
    return (pending ??= (async () => {
      try {
        const token = accountToken(await readCredentials());
        // No sign-in on this daemon: DeepSeek is simply not shown.
        if (!token) cached = null;
        else {
          const balance = fromSummary(await fetchSummary(token));
          if (balance) cached = { ...balance, fetchedAt: new Date(now()).toISOString() };
        }
      } catch {
        // A failed request keeps the last balance instead of showing zero.
      } finally {
        last = now();
        pending = undefined;
      }
      return cached;
    })());
  };
}
