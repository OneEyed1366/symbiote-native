# @symbiote-native/cli

Scaffolds a new [SymbioteNative](../../README.md) app (`new`) or extends an already-scaffolded
one with more of `new`'s optional layers (`add`) — closing the gap the root README's
["Try It In Your Own App"](../../README.md#try-it-in-your-own-app) section otherwise documents
as a manual process.

## Install

```bash
npx @symbiote-native/cli new my-app --framework react
```

No install step: npx resolves the package's single `bin` entry automatically, the same
resolution `npx @angular/cli new` relies on. Published scoped, so there's no separate short
command to remember — `@symbiote-native/cli` is the one name for both identity and invocation.

## Use it

### New app

```bash
npx @symbiote-native/cli new my-app --framework react
npx @symbiote-native/cli new my-app --framework vue --vue-flavor sfc --navigation --expo-modules --pm pnpm
npx @symbiote-native/cli new my-app --framework solid
npx @symbiote-native/cli new my-app --framework svelte
```

`--framework` is one of `react | vue | angular | solid | svelte`; `--vue-flavor tsx|sfc` only
applies to Vue (default `sfc`). `--pm` defaults to whichever package manager launched the
process (npm/pnpm/yarn, detected from `npm_config_user_agent`). Any flag left out is asked for
interactively.

`--javascript` opts out of TypeScript (default on). Angular is the one exception — its AOT
pipeline compiles templates as a TypeScript-compiler extension, so `--javascript` is ignored for
it:

| framework         | JS  | TS  |
| ------------------ | --- | --- |
| react               | ✅  | ✅  |
| vue (sfc \| tsx)    | ✅  | ✅  |
| solid               | ✅  | ✅  |
| svelte              | ✅  | ✅  |
| angular             | ❌  | ✅  |

`--styling` picks the App stub's styling convention: `css` (default), `css-modules`, `scss`,
`less`, `stylus`, or `stylesheet` (`StyleSheet.create`).

### Extend an existing app

```bash
npx @symbiote-native/cli add --navigation --testing --splash-screen
npx @symbiote-native/cli add   # interactive: offers only layers not already present
```

`add` requires a `@symbiote-native/<adapter>` dependency in the current directory's
`package.json` — it extends an app `new` already scaffolded (or an equivalent hand-built one),
the same way `vue add <plugin>` extends a `vue create` project. It never touches App/user
source: native files get idempotent text-splices, JS wiring (e.g. the navigator import) is
printed in the outro instead. `--force` skips the confirm before overwriting an
already-generated `--testing` layer's files.

### Layers

`--navigation` and `--expo-modules` are additive layers, not competing base profiles — every
SymbioteNative app is bare React Native. `--expo-modules` layers in autolinking alone (`expo` +
`expo-modules-link`); every Expo-backed package (`@symbiote-native/battery`, `.../sensors`, …)
is its own flag (`--battery`, `--sensors`, …) and implies `--expo-modules` without asking twice.
See [`templates/layers/README.md`](templates/layers/README.md) for the full layer list and what
each one touches.

## Shape

```
src/
  index.ts                    # entry point — argv → subcommand routing, error reporting
  cli.ts                      # hand-rolled argv parser (no dependency)
  prompts.ts                  # @clack/prompts wrappers for every option this CLI resolves
  detect-package-manager.ts   # npm_config_user_agent → npm | pnpm | yarn
  detect-framework.ts         # cwd package.json deps → react | vue | angular | solid | svelte
  template-dir.ts             # (framework, vueFlavor) → templates/js/<dir> name
  get-command.ts              # (pm, 'install'|'dev') → printable shell command
  generate.ts                 # scaffoldApp() — the actual copy/merge orchestration
  add-layers.ts               # addLayersToApp() — extends an EXISTING app with optional layers
  detect-added-layers.ts      # cwd package.json deps -> which optional layers are already present
  errors.ts                   # CliUsageError, NotSymbioteAppError
  expo-package-layers.ts      # EXPO_PACKAGE_LAYERS — one entry per Expo-backed package
  utils/
    render-template.ts        # recursive copy, package.json merge, .gitignore append
    deep-merge.ts
    sort-dependencies.ts
    json.ts
  commands/
    new.ts                    # resolves options, calls scaffoldApp(), prints install/dev commands
    add.ts                    # eligibility guard + resolveAddLayers, calls addLayersToApp()
templates/                    # see templates/README.md
build.config.ts               # rolldown config for the bundle.js publish artifact
```

Mirrors [`create-vue`](https://www.npmjs.com/package/create-vue)'s toolchain choice: zero
runtime dependencies, bundled to a single dependency-free `bundle.js` at publish time.
`render-template.ts` / `deep-merge.ts` / `sort-dependencies.ts` are ported from it directly.
Argv parsing is hand-rolled rather than a `commander`/`yargs` dependency, for the same
fast-`npx`-cold-start reason create-vue avoids one — it still supports `--flag=value` alongside
`--flag value`, "did you mean" suggestions for a typo'd command/flag, and rejects
`--flag=value` on a boolean flag loudly rather than silently ignoring it.

## Status

Real and verified against scaffolded-app fixtures: argv parsing, every interactive prompt,
package-manager/framework autodetection, the full `templates/` tree (6 frameworks × all 26
optional layers), and `add`'s idempotent native-file text-splices.

Not wired in yet: the root `pnpm run build`/`prepublish-build` pipeline doesn't invoke this
package's `rolldown` build — every other publishable package goes through `tsc --build` +
`fix-esm-extensions`, which this one deliberately doesn't (see `build.config.ts`).

## References

- Root [`README.md`](../../README.md) — the "Try It In Your Own App" section this package
  replaces.
- [`templates/layers/README.md`](templates/layers/README.md) — the full layer list.
- `symbiote-create-cli` skill — design history: why `add` extends rather than bootstraps, the
  layering model, and the real bugs a systematic `examples/*` diff found while building this.
