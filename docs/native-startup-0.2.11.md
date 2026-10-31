# Проверка 0.2.11

Ветка `fix/native-startup-load` создана от `origin/main` (`5d33742`). Production 0.2.10 не изменён.

`npm run typecheck` и `npm test`: 17 тестов проходят. Новые тесты проверяют повторные snapshots, queued remove/replacement, смену workspace, очередь по 4, отмену до первого task и посередине, неизменившийся label/visible, сериализацию RPC, refresh, смену провайдера во время чтения, поздние success/error и очистку таймеров.

## Bundle

Повторено воспроизведение диагноста с captured bundle 0.2.10 из `/tmp/paseo-client-catalog.json` и bundle 0.2.11, собранным настоящим `compilePlugin`. Используется тот же upstream PluginButtonStore 0.13.2, SDK shared primitives 0.12 и настоящий QueryClient. В отличие от исходного harness, timers здесь выполняются настоящими `setTimeout`, RPC возвращает одинаковый fixture snapshot, затем запускаются tick, provider reread и повторный snapshot.

На 96 fixture-агентах:

- Максимум регистраций за task: 96 -> 4. После setup и microtasks: 96 -> 0.
- Startup store notifications: 192 -> 96 (baseline включает 96 adds и 96 updates после первого read).
- Неизменившийся tick: 96 SDK updates -> 0. Неизменившийся provider reread: 96 -> 0.
- Повторный snapshot: 96 новых adds -> 0.
- Dispose до первого task: 0 adds/removes, середина: 4 adds/4 removes, хвост отменён.
- Dispose/eval/setup новой инстанции: снова 96 adds, по 4 за task, 96 removes. Глобальных SDK handles нет.

Это счётчики API и store notifications в Mac V8 VM без DOM, Android branch, RN UI stubs. Это не React renders, не замеры Hermes, FPS, relay или телефона.

Результат: `docs/native-startup-0.2.11.json`.

Повторение из worktree:

```sh
PASEO_HOST_MODULE_ROOT=/Users/agmazin/Library/Developer/paseo-kanban/node_modules \
PASEO_PLUGIN_COMPILER=/Users/agmazin/Library/Developer/paseo-cli012/node_modules/@getpaseo/server/dist/server/server/plugins/compiler.js \
PASEO_BUTTON_SOURCE=/Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-client-patches/.upstream/packages/app/src/plugins/buttons \
PASEO_BASELINE_CATALOG=/tmp/paseo-client-catalog.json \
node tests/native-startup.mjs
```

## Hot deployment после технической приёмки

Команды здесь подготовлены, но не выполнялись. Сначала проверить/влить PR и использовать принятый commit. Текущая установленная директория должна остаться той же, чтобы не менять конфигурацию установки. `rsync --delete` намеренно не используется: сохраняются существующие node_modules и локальные файлы.

```sh
source_dir=/Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-limits-startup
release_dir=/Users/agmazin/Library/Developer/paseo-releases/paseo-limits
backup_dir="/private/tmp/paseo-limits-before-0.2.11-$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_dir"
rsync -a --exclude=node_modules --exclude=.git "$release_dir/" "$backup_dir/"
rsync -a "$source_dir/client/" "$release_dir/client/"
rsync -a "$source_dir/shared/" "$release_dir/shared/"
rsync -a "$source_dir/server/" "$release_dir/server/"
rsync -a "$source_dir/index.client.tsx" "$source_dir/index.server.ts" "$source_dir/paseo-plugin.json" "$source_dir/package.json" "$source_dir/package-lock.json" "$source_dir/OVERVIEW.md" "$source_dir/CHANGELOG.md" "$release_dir/"
paseo plugin reload paseo-limits
paseo plugin ls --json
paseo plugin logs paseo-limits
```

Проверить `running`, версию 0.2.11 и отсутствие ошибок. Reload доставляет новый bundle подключённым клиентам; APK/USB не нужны. При откате скопировать сохранённые runtime-файлы из `$backup_dir` обратно в `$release_dir` и повторить `paseo plugin reload paseo-limits`.
