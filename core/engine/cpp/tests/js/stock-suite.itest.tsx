// @symbiote-platform-extensions
//
// The whole benchmark screen through REACT'S OWN Fabric renderer — the baseline column, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`. This is the
// arm every other one is read against, and until `stock-renderer-probe.itest.tsx` stood
// `ReactFabric-prod` up in this harness it could only be taken on a device.
//
// The row is `memo`'d and carries RN's own host names, so it is the same ten nodes and the same
// workload `examples/bare-rn/screens/BenchmarkScreen.tsx` commits.
//
// THE TEXT INPUT IS THE COMPONENT, NOT THE VIEW, and for a year it was the view. This row wrote
// `h('RCTSinglelineTextInputView', …)` — a bare Fabric view with nothing above it — while every
// adapter arm wrote `h('text-input', …)`, which reaches a host behavior that seeds a prop, wires
// four listeners and attaches a press machine. Both commit one node named `TextInput`, so the
// census oracle could not tell them apart and the substitution was invisible for as long as it
// stood. `examples/bare-rn:413` mounts `<TextInput>`, so the DEVICE baseline never had this gap;
// only the headless one did, which is precisely the direction that makes headless flatter stock.
//
// Priced in `stock-text-input-cost.itest.tsx`, same tree, byte-identical census, three runs:
// **50-53 us per instance**, i.e. ~52 ms on this thousand-row create. Our own `text-input` tag costs
// 15-17 us (`reconciler-floor.itest.tsx`), so the substitution was worth roughly 35 ms of the gap
// this suite reported between stock and every adapter.
//
// The engine telemetry on every line reads zero, and correctly: stock drives
// `nativeFabricUIManager` itself, so none of our walk or apply is in the path. Only the wall clock
// is comparable here.
//
// RUN ON `build-release` (`pnpm run bench:itest`) — a development React cannot drive
// `ReactFabric-prod` at all. See `isBenchBuild` in `scripts/run-itests.mjs`.

import { createElement as h, memo } from 'react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  readFabricTelemetry,
  runBenchSuite,
  type IBenchRow,
} from './bench-suite';
import { describe, flushTimers, it, mounted, print, report } from './harness';
import { loadStockRenderer } from './stock-renderer';

// IN THE BODY, not an `import`, and the ordering is the whole reason: RN's feature flags reach
// `TurboModuleRegistry` at MODULE scope and throw "__fbBatchedBridgeConfig is not set". The fakes
// that satisfy that are module-scope assignments in `./stock-renderer`, and every ESM import in this
// file evaluates before any of its body — so an import of a React Native component would be hoisted
// past them. A `require` here runs after them.
//
// BY PATH rather than from the `react-native` barrel: that barrel reaches
// `src/private/components/virtualcollection/VirtualCollectionView`, whose `VirtualViewMode` import
// has no matching export, and the bundle fails to build at all.
//
// `.default` because the module is ESM underneath and the interop hands back a namespace.
/* eslint-disable @typescript-eslint/no-require-imports -- prettier rewraps this across lines,
   which drifts a disable-next-line off target; see this file's own header for why it's a require */
const TextInput =
  require('react-native/Libraries/Components/TextInput/TextInput').default;
// THE SAME CORRECTION THE INPUT ALREADY TOOK, applied to the other four nodes of the row. This file
// wrote `h('RCTView')` and `h('RCTText')` — Fabric view names with no component above them — where
// no React Native app writes anything but `<View>` and `<Text>`, so the baseline was priced against
// a row nobody ships. `stock-row-components-cost.itest.tsx` measures it on the byte-identical
// census: 135 ms for the bare names against 171 for these, i.e. **~33 ms of a thousand-row create**
// that the published stock column never paid.
//
// `<View>` and NOT `<Pressable>` for the two cells, although `examples/bare-rn:404` mounts pressables
// there: every adapter arm in this directory builds its cells from a plain `view` tag
// (`react-suite.itest.tsx:46`), and an arm that carried a press machine none of its counterparts
// carry would be the same substitution again, pointing the other way. That row is measured too, in
// the same fixture, and costs a further ~68 ms — the number to reach for when the subject is the
// DEVICE baseline rather than this suite.
const View = require('react-native/Libraries/Components/View/View').default;
const Text = require('react-native/Libraries/Text/Text').default;
/* eslint-enable @typescript-eslint/no-require-imports */

const Row = memo(function RowView({
  row,
  isSelected,
}: {
  row: IBenchRow;
  isSelected: boolean;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h(Text, { ellipsizeMode: 'tail' }, text);

  return h(
    View,
    {
      style: isSelected ? SELECTED_ROW_STYLE : ROW_STYLE,
      // No id prop — the row is kept concrete by `ROW_STYLE`'s background, as on the device screen.
    },
    label(String(row.id)),
    h(View, { style: CELL_STYLE }, label(row.label)),
    h(View, { style: CELL_STYLE }, label('x')),
    h(TextInput, { style: INPUT_STYLE, value: row.label }),
  );
});

// `__DEV__` is the runner's own define and it tracks the build. See `stock-create-cost.itest.tsx`.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

describe('the benchmark screen through stock React Native', () => {
  it('runs the eight device steps', async () => {
    if (!canHostStock) {
      print(
        'DEBUG stock suite SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }

    // A failing stock render is SILENT — React retries and reports through RN's error dialog into
    // `console.error`, leaving a surface holding `RootView()`. A suite measured against an empty
    // tree reads near zero on every step and would fail only on the oracle, which is the point of
    // having one; this makes the CAUSE visible too.
    const console_ = (globalThis as Record<string, unknown>).console;
    if (typeof console_ === 'object' && console_ !== null) {
      const bag = console_ as Record<string, unknown>;
      bag.error = (...args: unknown[]) => {
        print(
          `DEBUG stock console.error: ${args.map(String).join(' ')}`.slice(
            0,
            300,
          ),
        );
      };
      bag.warn = bag.error;
    }

    const { render } = loadStockRenderer();
    render(h('RCTView', { style: { flex: 1 } }), ROOT_TAG);
    flushTimers();
    mounted();

    await runBenchSuite({
      name: 'stock',
      // FABRIC'S OWN COMMIT TELEMETRY, read straight off the native bindings rather than through
      // `@symbiote-native/engine` — this file carries `@symbiote-platform-extensions`, under which
      // the engine's `processColor` import resolves RN's `Platform.ios.js`, reaches for a native
      // module and kills the bundle before anything runs.
      //
      // It is the same read every adapter arm makes and it answers about the SURFACE, not about us:
      // React's own renderer drove this tree, so `laidOut` and `texts` here are what Fabric costs
      // for the workload with our engine nowhere in the path. Without this column, a `laidOut=7000`
      // on an adapter's `select` cannot be told from a bug in our commit.
      //
      // Every engine-only counter reads zero, which is correct and is what `engineLine` prints.
      readTelemetry: readFabricTelemetry,
      drivesEngine: false,
      // The root and the screen's own wrapper. One fewer than every adapter arm, because
      // `ReactFabric.render` mounts straight into the root where `createSurface` puts a container
      // under it — the same one-node difference `CLAUDE.md` records as `createNode 10001 vs 10000`.
      chrome: 2,
      // The baseline half of the mutation comparison — see the React arm for what it is for.
      countsMutations: true,
      apply: state => {
        render(
          h(
            'RCTView',
            { style: { flex: 1 } },
            ...state.rows.map(row =>
              h(Row, {
                key: row.id,
                row,
                isSelected: row.id === state.selectedId,
              }),
            ),
          ),
          ROOT_TAG,
        );
        flushTimers();
      },
    });
  });
});

report();
