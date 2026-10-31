import type { PluginButtonRegistration, PluginClientContext, PluginButtonContentProps } from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import type { LimitsState } from "./state";
import { label, windows } from "../shared/model";

type Agent = { id: string; workspaceId?: string | null };
const batchSize = 4;

export function createPills(client: PluginClientContext, state: LimitsState, Content: ComponentType<PluginButtonContentProps>) {
  const pills = new Map<string, { workspaceId: string; handle: PluginButtonRegistration; signature: string }>();
  const queued = new Map<string, Agent>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  let available = new Set<string>();
  const descriptor = (id: string) => ({
    label: label(state.get().data),
    visible: windows(state.get().data).length > 0 && !available.has("*") && !available.has(id),
  });
  const signature = (button: ReturnType<typeof descriptor>) => JSON.stringify(button);
  const remove = (id: string) => {
    queued.delete(id);
    pills.get(id)?.handle.remove();
    pills.delete(id);
  };
  const drain = () => {
    timer = undefined;
    if (!alive) return;
    for (const [id, agent] of [...queued].slice(0, batchSize)) {
      queued.delete(id);
      if (!agent.workspaceId) continue;
      const button = descriptor(id);
      const handle = client.addComposerPill({
        id: "limits", workspaceId: agent.workspaceId, agentId: id,
        button: { ...button, title: "Лимиты подписок", icon: "Gauge", behavior: { kind: "popover", Content } },
      });
      pills.set(id, { workspaceId: agent.workspaceId, handle, signature: signature(button) });
    }
    schedule();
  };
  const schedule = () => {
    if (alive && queued.size && timer === undefined) timer = setTimeout(drain, 0);
  };
  const upsert = (agent: Agent) => {
    if (!alive) return;
    if (!agent.workspaceId) return remove(agent.id);
    const pill = pills.get(agent.id);
    if (pill?.workspaceId === agent.workspaceId) return;
    if (pill) remove(agent.id);
    queued.set(agent.id, agent);
    schedule();
  };
  const update = () => {
    if (!alive) return;
    for (const [id, pill] of pills) {
      const button = descriptor(id);
      const next = signature(button);
      if (next === pill.signature) continue;
      pill.handle.update(button);
      pill.signature = next;
    }
  };
  const unsubscribe = state.subscribe(update);
  return {
    upsert,
    remove,
    snapshot(agents: Agent[]) {
      if (!alive) return;
      const ids = new Set(agents.map(agent => agent.id));
      for (const id of [...pills.keys(), ...queued.keys()]) if (!ids.has(id)) remove(id);
      for (const agent of agents) upsert(agent);
    },
    available(value: Set<string>) { available = value; update(); },
    dispose() {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
      queued.clear();
      unsubscribe();
      for (const id of pills.keys()) remove(id);
    },
  };
}
