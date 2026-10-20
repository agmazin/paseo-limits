import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
const date = z.string().refine(v=>Number.isFinite(Date.parse(v)));
const provider = z.object({ windows: z.array(z.object({windowSeconds:z.number().positive(),usedPercent:z.number().min(0).max(100),resetsAt:date})) });
export const snapshotSchema = z.object({claude:provider.optional(),codex:provider.optional(),fetchedAt:date});
export const readLimits = defineRpc({name:'limits.read',input:z.object({}),output:snapshotSchema.nullable()});
export const refreshLimits = defineRpc({name:'limits.refresh',input:z.object({}),output:snapshotSchema.nullable()});
