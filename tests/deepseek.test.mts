import assert from "node:assert/strict";
import { test } from "node:test";
import { accountToken, deepseekReader, fromSummary } from "../server/deepseek.ts";
import { balanceText, balanceTone, balanceTooltip, label } from "../shared/model.ts";
import { snapshotSchema } from "../shared/contracts.ts";

const yaml = `version: 1
records:
  client-connection/browser-session:
    kind: grant
    payload:
      version: 1
      secret: other-secret
  deepseek-account-platform/default:
    kind: grant
    payload:
      version: 1
      token: tok_abc123
      issuer: https://platform.deepseek.com
`;
const summary = (balance: string, bonus = "0", spent = "0.04") => ({ code: 0, msg: "", data: { biz_code: 0, biz_msg: "", biz_data: {
  normal_wallets: [{ currency: "USD", balance }], bonus_wallets: [{ currency: "USD", balance: bonus }], total_costs: [{ currency: "USD", amount: spent }] } } });

test("the account token is read from the Harness credential store only", () => {
  assert.equal(accountToken(yaml), "tok_abc123");
  assert.equal(accountToken("version: 1\nrecords: {}\n"), null);
});

test("balance sums recharge and bonus wallets of one currency, spent is total cost", () => {
  assert.deepEqual(fromSummary(summary("1.964", "0.5")), { currency: "USD", balance: 2.464, spent: 0.04 });
  assert.equal(fromSummary({ code: 40003 }), null);
  assert.equal(fromSummary({ code: 0, data: { biz_code: 1 } }), null);
});

test("texts and tones", () => {
  const b = { currency: "USD" as const, balance: 1.9642, spent: 0.0358 };
  assert.equal(balanceText(b), "$1,96");
  assert.equal(balanceTooltip(b), "DeepSeek: на балансе 1,96 долларов, потрачено 0,04");
  assert.equal(balanceTone({ ...b, balance: 0.3 }), "warn");
  assert.equal(balanceTone({ ...b, balance: 0.05 }), "bad");
  assert.equal(label({ fetchedAt: new Date().toISOString(), deepseek: b }), "DeepSeek $1,96");
  assert.ok(snapshotSchema.safeParse({ fetchedAt: new Date().toISOString(), deepseek: b }).success);
});

test("reader caches for a minute, keeps the last balance on failure, hides without sign-in", async () => {
  let clock = 0, calls = 0, fail = false, creds = yaml;
  const read = deepseekReader(async () => creds, async (token) => { calls++; assert.equal(token, "tok_abc123"); if (fail) throw Error("net"); return summary("1.5"); }, () => clock);
  assert.equal((await read())?.balance, 1.5);
  await read(); assert.equal(calls, 1);
  clock = 61000; fail = true;
  assert.equal((await read())?.balance, 1.5, "failure keeps the last balance");
  clock = 122000; creds = "version: 1\n";
  assert.equal(await read(), null, "signed out: not shown");
});
