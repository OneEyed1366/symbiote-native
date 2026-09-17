// What the pressable port BOUGHT, priced against the thing it replaced, in one process.
//
// The eight-step suite arms cannot answer this and it is worth saying why rather than quoting them:
// their row is `view / text / view+text / view+text / text-input`, which is the device row with its
// two `<Pressable>`s spelled as plain views. So `folds` reads 0 on every arm whether or not this
// rule moved, and a table taken from them would be evidence of nothing.
//
// This is the A/B instead, and it is a fair one because both arms are the SAME tree in the SAME
// process, differing only in WHERE the rule runs:
//
//   `pressable`            the rule in C++, reached off the tag (`foldPressableProps`)
//   `pressable-in-js`      a tag registered here with a `payloadFold` that produces the same
//                          payload — which is what `pressable` itself was until this commit
//
// The payloads are asserted EQUAL before any millisecond is read. Two arms that disagree about
// what they send are not one measurement, and a fold that quietly did less would look faster.
//
// MEASURED on `build-release`, three consecutive runs, a thousand pressables in one commit:
//
//   native walk  5.6  5.7  5.8 ms   folds=0
//   js     walk 28.6 28.4 28.3 ms   folds=1000     ~22.7 us per node per commit
//
// So the rule itself is ~5.7 ms and the CROSSING was ~23 ms — four times the work it was carrying,
// which is the same shape the text-input port measured (~17 us on a smaller bag) and the reason a
// fold's price is the trip and not the function. On the device row that is two per row, on every
// commit a row is dirty in, for the life of the screen.

import { registerPressableBehavior } from '@symbiote-native/components';

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  registerHostBehavior,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROWS = 1_000;
const PRESSABLE_VIEW = 'RCTView';
const JS_TAG = 'pressable-in-js';

registerPressableBehavior();

// The JS half of the A/B: `foldPayload` as `core/components/src/behaviors/pressable.ts` carried it
// before the port — the accessibility resolution, the defaults, and the machine-key strip. It is
// NOT a mirror kept in the source tree; it exists in this measurement file only, which is the one
// place a copy is the point rather than the problem.
const MACHINE_ONLY_KEYS = [
  'android_ripple',
  'disabled',
  'cancelable',
  'delayLongPress',
  'minPressDuration',
  'unstable_pressDelay',
  'pressRetentionOffset',
  'delayHoverIn',
  'delayHoverOut',
];

registerHostBehavior(JS_TAG, {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = { ...props };
    if (typeof props.disabled === 'boolean') {
      const authored = props.accessibilityState;
      const state: Record<string, unknown> =
        authored !== null && typeof authored === 'object'
          ? { ...authored }
          : {};
      state.disabled = props.disabled;
      out.accessibilityState = state;
    }
    for (const key of MACHINE_ONLY_KEYS) delete out[key];
    out.accessible = props.accessible !== false;
    out.focusable = props.focusable !== false;
    return out;
  },
});

// The props a real pressable row carries: the two the rule reads, one it strips, and a style, so the
// bag is the size a fold actually marshals rather than a two-key toy.
const ROW_PROPS = {
  disabled: true,
  delayLongPress: 700,
  accessibilityLabel: 'row',
  style: { flexDirection: 'row', paddingLeft: 8, height: 44 },
};

type IArm = {
  readonly walk: number;
  readonly folds: number;
  readonly payload: Readonly<Record<string, unknown>>;
};

function buildList(rootTag: number, tag: string): IArm {
  const surface = createSurface(rootTag);
  const container: ISymbioteNode = createElement(PRESSABLE_VIEW, false, 'view');
  surface.appendChild(container);

  let first: ISymbioteNode | undefined;
  for (let index = 0; index < ROWS; index += 1) {
    const node: ISymbioteNode = createElement(PRESSABLE_VIEW, false, tag);
    for (const [name, value] of Object.entries(ROW_PROPS)) {
      setProp(node, name, value);
    }
    setProp(node, 'testID', `row-${index}`);
    appendChild(container, node);
    if (first === undefined) first = node;
  }

  surface.commit();
  mounted();

  const telemetry = readSurfaceTelemetry(rootTag);
  const payload = first === undefined ? undefined : committedPayloadOf(first);
  if (payload === undefined) throw new Error('the list committed no payload');
  return {
    walk: telemetry?.walkMs ?? 0,
    folds: telemetry?.foldsFound ?? 0,
    payload,
  };
}

describe('what the pressable rule costs on each side of the wire', () => {
  it('sends the identical payload either way', () => {
    const native = buildList(1, 'pressable');
    const js = buildList(2, JS_TAG);

    // The gate on the whole measurement. Key order is the host's, so compare by NAME and by value.
    expect(Object.keys(native.payload).sort().join(' ')).toBe(
      Object.keys(js.payload).sort().join(' '),
    );
    for (const key of Object.keys(native.payload)) {
      expect(JSON.stringify(native.payload[key])).toBe(
        JSON.stringify(js.payload[key]),
      );
    }
    print(`payload keys: ${Object.keys(native.payload).sort().join(' ')}`);
  });

  it('pays no trip into JS for a thousand pressables', () => {
    const native = buildList(3, 'pressable');
    const js = buildList(4, JS_TAG);

    print(
      `DEBUG pressable  native walk=${native.walk.toFixed(1)} folds=${native.folds}` +
        `  js walk=${js.walk.toFixed(1)} folds=${js.folds}` +
        `  per node=${(((js.walk - native.walk) / ROWS) * 1_000).toFixed(1)} us`,
    );

    // The rule runs on both arms and produced the same payload, so the only difference left is the
    // crossing. The assertion is on the COUNT rather than on the clock: a wall-time bound would be
    // a flake on a loaded machine, and the count is what the port actually changed.
    expect(native.folds).toBe(0);
    expect(js.folds).toBe(ROWS);
  });
});

report();
