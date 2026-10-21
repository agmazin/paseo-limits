import { Platform } from "react-native";
declare const document: {head:{append(n:unknown):void};createElement(tag:string):{textContent:string;remove():void}};
// A stylesheet follows remounted desktop/mobile sidebars and is removed on unload.
export function hideNativeUsage(hidden:boolean) {
  if (Platform.OS !== "web" || !hidden) return () => {};
  const style = document.createElement("style");
  style.textContent = '[data-testid="sidebar-usage-icon"]{display:none !important}';
  document.head.append(style);
  return () => style.remove();
}
