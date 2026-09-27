// The whole benchmark screen through the Solid adapter — all eight device steps, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`.
//
// Solid is fine-grained and synchronous, so a step needs no scheduler turn: the signal write runs
// the effects that read it before it returns.
//
// `<For>` is the keyed list Solid's own benchmark uses, and it is what makes `Replace` a real
// teardown — a thousand unseen keys against `<Index>`, which would reuse every row.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { For, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/solid';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  runBenchSuite,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

// A STORE keyed on `id`, which is what `examples/solid/screens/BenchmarkScreen.tsx` uses and what
// makes `<For>`'s rows stable proxies over stable objects. A plain signal replaced wholesale would
// hand `<For>` a thousand unseen object identities on every step: measured first that way, a partial
// update of a hundred rows rebuilt all thousand (`created=1000 setProps=1000` where every other
// adapter reports `created=0 setProps=100`). That is a fact about the spelling, not about Solid.
const [state, setState] = createStore<IBenchState>({
  rows: [],
  selectedId: undefined,
});

function Row(props: { row: IBenchRow; isSelected: boolean }): JSX.Element {
  return (
    <view
      style={props.isSelected ? SELECTED_ROW_STYLE : ROW_STYLE}
      // No id prop — the row is kept concrete by `ROW_STYLE`'s background, as on the device screen.
    >
      <text ellipsizeMode="tail">{String(props.row.id)}</text>
      <view style={CELL_STYLE}>
        <text ellipsizeMode="tail">{props.row.label}</text>
      </view>
      <view style={CELL_STYLE}>
        <text ellipsizeMode="tail">x</text>
      </view>
      <text-input style={INPUT_STYLE} text={props.row.label} />
    </view>
  );
}

function Screen(): JSX.Element {
  return (
    <view style={{ flex: 1 }}>
      <For each={state.rows}>
        {entry => (
          <Row row={entry} isSelected={entry.id === state.selectedId} />
        )}
      </For>
    </view>
  );
}

describe('the benchmark screen through the Solid adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, Screen);
    flushTimers();
    surface.commit();
    mounted();

    await runBenchSuite({
      name: 'solid',
      // The root, the container `createSurface` puts under it, and the screen's own wrapper.
      chrome: 3,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: next => {
        setState(reconcile(next, { key: 'id' }));
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();
