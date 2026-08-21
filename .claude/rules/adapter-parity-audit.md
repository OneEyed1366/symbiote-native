# Auditing cross-adapter parity: run the TypeScript checker, never grep

`<adapters_reach_full_feature_parity>` is P0, and the failure it guards against is silent — a
capability four adapters export and the fifth does not, with nothing red anywhere. `tsc` is happy,
every test passes, and the gap surfaces only when someone tries the import.

**Grep cannot answer the question.** Measured 2026-08-20: counting files that mention
`createPortal` gave `react 4 · vue 1 · svelte 1 · angular 2 · solid 1` and read as "everyone has
it, Solid nearly does". Every one of those Vue/Svelte/Solid hits was a COMMENT — including, in
Solid's case, a comment saying the feature is deliberately absent. The real exported surface:

```
           createPortal   other portal form                        createTunnel
react         yes           -                                        yes
vue           NO            NO                                       yes
svelte        NO            TunnelIn / TunnelOut                     yes
angular       NO            PortalDirective, PortalOutletDirective   yes
solid         NO            NO                                       NO
```

`createPortal` is React-only; the "4 of 5" gap was `createTunnel`. A grep-shaped answer sent an
agent looking for three reference implementations that do not exist.

## What `tests/adapter-barrel-parity.test.ts` already covers — and the hole beside it

That test exists, it is good, and it is NOT a substitute for this audit. It scans each adapter
barrel for names re-exported from the SHARED barrels (`core/engine/src/index.ts`,
`core/components/src/index.ts`) and compares `KNOWN_GAPS` for EQUALITY, so a passthrough added to
one adapter and forgotten in the others fails, and closing a gap without deleting its entry fails
too. That is the right design for passthroughs, and it already caught 22 of them.

**Its blind spot is everything an adapter OWNS.** `createPortal`, `createTunnel`,
`createAnimatedComponent` are implemented separately in each adapter, come from no shared barrel,
and are therefore invisible to it — which is exactly how Solid ended up with neither portal nor
tunnel while four adapters had one, with every test green. So: the barrel-parity test guards the
shared half, and this audit guards the adapter-owned half. Run both.

## The audit that does answer it

Resolve each barrel through the compiler and diff the export sets. Roughly 30 lines, ~1 min for
all five, and it follows re-exports, which is the whole point:

```js
import ts from 'typescript';
const opts = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
};
for (const a of ['react', 'vue', 'svelte', 'angular', 'solid']) {
  const entry = `adapters/${a}/src/index.ts`;
  const program = ts.createProgram([entry], opts);
  const checker = program.getTypeChecker();
  const sym = checker.getSymbolAtLocation(program.getSourceFile(entry));
  names[a] = new Set(checker.getExportsOfModule(sym).map(s => s.getName()));
}
```

Run it from the repo root so `typescript` resolves; delete the script afterwards.

## Reading the output without drowning

The raw diff is ~131 names and almost all of it is legitimate. Filter to **names missing from
exactly one or two adapters** — a name absent from three or four is nearly always a per-framework
family, not a gap. Then discount, by name:

- **Per-adapter prop types are BY DESIGN** (`<prop_types_split_agnostic_vs_per_adapter>`): Angular
  declares its own `IAngularPressableProps` and so lacks `IPressableProps`; Vue owns `*Emits` /
  `*Slots`; Solid re-exports Solid's `For` / `Index`.
- **Deliberate naming divergences are BY DESIGN** (`<adapter_src_follows_framework_idioms>`):
  Solid spells the lifecycle pair `createColorScheme` / `createWindowDimensions`, Angular ships
  them as services, so `useColorScheme` / `useWindowDimensions` reading "missing on angular, solid"
  is noise. Each such decision is documented in that adapter's barrel — check before filing a bug.

What survives the filter is the real list. In this run it was two items: `createTunnel` missing on
Solid, and `createAnimatedComponent` implemented-but-not-re-exported on Angular.

## The failure mode this catches, stated once

**A symbol can be implemented, tested, and still unreachable.** This happened THREE times in one
day, in three adapters, and every instance had passing tests:

- Angular's `createAnimatedComponent` — in `src/modules/animated/`, with its own negative tests,
  never re-exported from `src/index.ts`.
- Vue's `Teleport` — a working, guarded wrapper in `src/runtime-helpers/`, two tests, off the
  barrel. The barrel's own comment described it as a design decision ("Teleport stays
  same-surface-only by design"), which read as a note about something that existed. It did exist.
  It was simply unreachable, and the audit reported Vue as having no portal at all.
- Solid's portal and tunnel — the genuine absence, and the only one of the three that a source-tree
  reading would also have caught.

So the rule is not "check whether it is implemented" but **"check whether an app can import it"**,
and a comment near an export is evidence of intent, never of reachability. Only an audit of the
BARREL finds these; an audit of the source tree reports two of the three as present. See also
`.claude/rules/barrel-passthrough.md`.

Run this audit whenever an adapter finishes a layer, and before claiming parity in any report.

## The third parity surface: `packages/*/package.json` `exports` subpaths

Neither audit above sees it. The barrel test reads adapter barrels; the tsc audit resolves
`adapters/*/src/index.ts`. A companion package (`@symbiote-native/crypto`, `…/navigation`, …)
exposes itself through per-framework SUBPATHS declared only in its `package.json`:

```json
{ "./vue": "./src/core/index.ts", "./react": "./src/core/index.ts", "./angular": { … } }
```

A missing subpath is invisible to every test in the repo and fails at the consuming app's
`import` with `ERR_PACKAGE_PATH_NOT_EXPORTED` — the same "implemented but unreachable" shape as
the barrel case, one layer out. Measured 2026-08-21: 12 of 25 companion packages declared
`./vue ./react ./svelte ./angular` and no `./solid`, though all four were byte-identical aliases
of `./src/core/index.ts` and the Solid entry needed zero implementation.

Guarded since 2026-08-21 by `tests/package-subpath-parity.test.ts`, which RESOLVES each
`<pkg>/<framework>` specifier through TypeScript rather than reading the `exports` keys — a key
pointing at a deleted file passes a key check and fails a real build. Packages declaring no
framework subpath at all (`android`, `expo-modules-link`) are out of the contract and skipped.

For a one-off look without running the suite:

```bash
for p in packages/*/package.json; do
  node -p "require('./$p').name + ' | ' + Object.keys(require('./$p').exports||{})
    .filter(k=>/react|vue|svelte|angular|solid/.test(k)).join(' ')"
done
```

Read it as a grid, not a list: a package declaring four of the five adapters is the finding. Note
the per-framework value is often the SAME core path for every framework — so "does adapter X have
a real implementation here" and "can adapter X import this package" are different questions, and
this surface answers only the second.
