# @symbiote-native/react-migrator

Research tooling for migrating a React Native package's function components and hooks to
[SymbioteNative](../../README.md) core + every adapter: React, Vue, Svelte, Solid and Angular.

**Status: research.** No generator yet. It measures what a migrator would face and holds
hand-written expected outputs to aim one at. The record of what was measured lives in the
`symbiote-react-migrator-research` project skill.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --react-migrator
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --react-migrator
```

Either way it lands in `devDependencies`: a tool the app runs, with no native code to link. See
[`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI)</summary>

```bash
npm install --save-dev @symbiote-native/react-migrator
```

</details>

## Shape

```
src/classify-hooks.ts                 classifyPackageHooks: sorts a package's public use* by kind
fixtures/safe-area-context/expected/  context bridge: core.ts + one file per adapter
fixtures/safe-area-context/scenarios.ts  what upstream paints per scenario, read by both oracles
fixtures/react-native-maps/expected/  MapMarker as a core controller over dispatchViewCommand
scripts/compiler-events.cjs           React Compiler events per file
scripts/class-model.cjs               class components: LOC, state, lifecycle
scripts/vidact-probe.mjs              @vidact/compiler analyze/compile over a file
```

## Use it

```ts
import { classifyPackageHooks } from '@symbiote-native/react-migrator';

const report = classifyPackageHooks('node_modules/react-native-safe-area-context/src');
report.totals.public; // { context: 2, composite: 1 }
```

Inside this repo: `pnpm -C packages/react-migrator classify-hooks <package-src-dir>`.

## API

```ts
function classifyPackageHooks(root: string): IHookReport;
// IHookReport: { entries: IHookEntry[], totals: { all, public }, parseErrors }
// IHookKind: context | subscription | reanimated | derived | effect-only | composite | no-hooks
```

## Notes

- Hook kinds come from the calls in a body, first matching rule wins: a reading, not a proof of
  what a migrator can emit.
- `react-native-keyboard-controller` and `react-native-safe-area-context` are pinned exactly: the
  tests assert counts on their source and render upstream safe-area.

## Test it

```bash
pnpm -C packages/react-migrator test
```

- `classify-hooks.test.ts`: totals over the real safe-area-context and keyboard-controller sources
- `safe-area-vue-bridge.test.ts`: the Vue fixture mounted through `@symbiote-native/vue` over
  `installRecordingFabric`: reads, updates, the corner pick, the missing-Provider throw
- `safe-area-angular-bridge.test.ts`: the Angular fixture, same cases, in `runInInjectionContext`
- `upstream-safe-area-oracle.test.tsx`: the real upstream package under `@symbiote-native/react`, the
  reference: mount, insets event, identical event, frameless event, nested Provider, `edges` array
- `safe-area-vue-oracle.test.ts`: a hand-written Vue Provider against the same expected trees; 4 of
  those scenarios so far
