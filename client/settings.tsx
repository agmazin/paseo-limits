import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { displaySettings } from "../shared/settings";
export function DisplaySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(displaySettings);
  if (settings.status !== "ready") return <Text style={{color:theme.colors.foregroundMuted}}>{settings.status === "loading" ? "Загрузка настроек..." : "Не удалось загрузить настройки"}</Text>;
  return <SettingsSection title="Боковая панель"><SettingsCard><SettingsSwitch
    label="Скрывать штатный значок Usage"
    value={settings.values.hideNativeUsage} disabled={settings.saving}
    onValueChange={hideNativeUsage => { void settings.save({...settings.values, hideNativeUsage}, settings.revision); }}
    error={settings.saveError ? "Не удалось сохранить настройку" : undefined}
  /><SettingsSwitch
    label="Одна полоса внизу окна вместо строки под каждым чатом"
    value={settings.values.placement === "window"} disabled={settings.saving}
    onValueChange={on => { void settings.save({...settings.values, placement: on ? "window" : "composer"}, settings.revision); }}
  /></SettingsCard></SettingsSection>;
}
