import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
const date = z.string().refine((v) => Number.isFinite(Date.parse(v)));
const limitWindow = z.object({
  windowSeconds: z.number().positive(),
  usedPercent: z.number().min(0).max(100),
  resetsAt: date,
});
const provider = z.object({
  windows: z.array(limitWindow),
  unavailable: z.literal(true).optional(),
});
export const snapshotSchema = z.object({
  testData: z.boolean().optional(),
  personal: z.boolean().optional(),
  claude: provider.optional(),
  codex: provider.optional(),
  deepseek: z
    .object({
      currency: z.enum(["USD", "CNY"]),
      balance: z.number().finite(),
      spent: z.number().finite().nonnegative().optional(),
      fetchedAt: date.optional(),
    })
    .optional(),
  fetchedAt: date,
});

// The poller may retain old windows alongside an error. Only publish usable windows
// from this poll, and keep account and error details on the daemon.
const unavailable = { windows: [], unavailable: true as const };
const fileProvider = z.object({
  windows: z.array(limitWindow.nullable().catch(null)),
  error: z.unknown().optional(),
  unavailable: z.boolean().optional(),
}).transform(({ windows, error, unavailable: failed }) => {
  if (error || failed) return unavailable;
  const valid = windows.filter(window => window !== null);
  return windows.length && !valid.length ? unavailable : { windows: valid };
}).catch(unavailable);
export const fileSnapshotSchema = snapshotSchema.extend({
  claude: fileProvider.optional(),
  codex: fileProvider.optional(),
  deepseek: snapshotSchema.shape.deepseek.catch(undefined),
});
export const readLimits = defineRpc({
  name: "limits.read",
  input: z.object({}),
  output: snapshotSchema.nullable(),
});
export const refreshLimits = defineRpc({
  name: "limits.refresh",
  input: z.object({}),
  output: snapshotSchema.nullable(),
});
