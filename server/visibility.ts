import type { Snapshot } from "../shared/model";

interface ProviderConfig {
  providers: Record<string, { enabled?: boolean }>;
}

export function createVisibility(
  getConfig: () => Promise<{ config: ProviderConfig }>,
  log: (message: string) => void,
) {
  let providers: ProviderConfig["providers"] = {};
  return async (snapshot: Snapshot | null): Promise<Snapshot | null> => {
    try {
      providers = (await getConfig()).config.providers;
    } catch {
      log("Лимиты: настройки провайдеров недоступны; сохранена последняя видимость");
    }
    if (!snapshot) return null;
    const visible = { ...snapshot };
    for (const key of ["claude", "codex"] as const) {
      if (providers[key]?.enabled === false) delete visible[key];
    }
    return visible;
  };
}
