import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
export const displaySettings = defineSettings({
  id: "display", scope: "host", version: 1,
  schema: z.object({ hideNativeUsage: z.boolean().default(true) }),
});
