import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
export const displaySettings = defineSettings({
  id: "display", scope: "host", version: 1,
  schema: z.object({
    hideNativeUsage: z.boolean().default(true),
    // "window": one bar along the bottom edge of the Paseo window; "composer": a row under every chat.
    placement: z.enum(["window", "composer"]).default("window"),
  }),
});
