import { useSettings } from "@getpaseo/plugin/client";
import { displaySettings } from "./shared/settings";
import { DisplaySettings } from "./client/settings";
import { hideNativeUsage } from "./client/native-usage";
import { useEffect } from "react";
import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { createState } from "./client/state";
import { Details } from "./client/ui";
import { mountRows } from "./client/web";
import { createPills } from "./client/pills";
export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({id:"display",title:"Лимиты",icon:"Gauge",Component:DisplaySettings});
  const state = createState(client);
  const lifetime = new AbortController();
  const Content = (props: PluginButtonContentProps) => (
    <Details {...props} state={state} />
  );
  const pills = createPills(client, state, Content);
  function Bridge({ theme, layout }: PluginSidebarItemProps) {
    const settings = useSettings(displaySettings);
    const hidden = settings.status !== "ready" || settings.values.hideNativeUsage;
    useEffect(() => hideNativeUsage(hidden), [hidden]);
    useEffect(
      () =>
        mountRows(state, theme, layout.compact, pills.available),
      [theme, layout.compact],
    );
    return null;
  }
  const removeBridge = client.addSidebarFooterItem({
    id: "limits-bridge",
    title: "Лимиты",
    Component: Bridge,
  });
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      if (lifetime.signal.aborted) return;
      subscription.subscribe({
        snapshot: ({ entries }) => {
          if (lifetime.signal.aborted) return;
          pills.snapshot(entries.map(({ agent }) => agent));
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const u = message.payload;
          if (lifetime.signal.aborted) return;
          if (u.kind === "upsert") pills.upsert(u.agent);
          else {
            pills.remove(u.agentId);
          }
        },
      });
    })
    .catch(() => {
      if (!lifetime.signal.aborted)
        console.error("Лимиты: не удалось подписаться на диалоги");
    });
  return () => {
    lifetime.abort();
    removeBridge();
    removeSettings();
    pills.dispose();
    state.dispose();
  };
}
