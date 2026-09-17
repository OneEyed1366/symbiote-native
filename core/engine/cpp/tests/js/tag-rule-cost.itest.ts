// What a ported tag rule BOUGHT, priced against the thing it replaced, in one process.
//
// The eight-step suite arms cannot answer this and it is worth saying why rather than quoting them:
// their row is `view / text / view+text / view+text / text-input`, which is the device row with its
// two `<Pressable>`s spelled as plain views, and it holds no `<switch>` at all. So `folds` reads 0
// on every arm whether or not a rule moved, and a table taken from them would be evidence of
// nothing.
//
// This is the A/B instead, and it is a fair one because both arms are the SAME tree in the SAME
// process, differing only in WHERE the rule runs:
//
//   `<tag>`         the rule in C++, reached off the tag
//   `<tag>-in-js`   a tag registered HERE with a `payloadFold` that produces the same payload —
//                   which is what the real tag was until the port
//
// The payloads are asserted EQUAL, key by key, before any millisecond is read. Two arms that
// disagree about what they send are not one measurement, and a fold that quietly did less would
// look faster.
//
// The JS arms are not mirrors in the sense the porting rule forbids: they exist in this measurement
// file only, nothing in the source tree calls them, and their whole job is to be the thing that was
// deleted. A rule with no "before" cannot be priced at all.
//
// MEASURED on `build-release`, three consecutive runs, one sitting, a thousand nodes per commit:
//
//              native walk          js walk              per node
//   pressable  4.0  4.0  3.9 ms     19.0 18.8 18.8 ms    ~14.9 us      folds 0 against 1000
//   switch     4.8  4.5  4.4 ms     21.7 20.6 20.4 ms    ~16.3 us      folds 0 against 1000
//
// So each rule itself is ~4-5 ms and the CROSSING was ~15-17 ms — three to four times the work it
// was carrying. That is the same shape the text-input port measured (~17 us) and the reason a
// fold's price is the TRIP and not the function: the bag goes out as a `jsi::Value` and comes back
// through `jsi::dynamicFromValue`, a per-key JSI walk, for a rule that rewrites a handful of keys.
//
// The pressable row read 5.6/28.6 when it was measured alone on a busier machine. Both figures are
// real and neither is the other's before/after — ONE RULER PER COMPARISON, which is why the two
// rules are now priced in the same file, in the same process, in one sitting.

import {
  registerPressableBehavior,
  registerSwitchBehavior,
} from '@symbiote-native/components';

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

registerPressableBehavior();
registerSwitchBehavior();

// ── the JS arms: each rule as its behavior carried it immediately before the port ────────────────

const PRESSABLE_MACHINE_KEYS = [
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

registerHostBehavior('pressable-in-js', {
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
    for (const key of PRESSABLE_MACHINE_KEYS) delete out[key];
    out.accessible = props.accessible !== false;
    out.focusable = props.focusable !== false;
    return out;
  },
});

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

registerHostBehavior('switch-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const value = props.value === true;
    const track = props.trackColor;
    const bag: Record<string, unknown> =
      track !== null && typeof track === 'object' ? { ...track } : {};
    const background = stringOf(props.ios_backgroundColor);
    const out: Record<string, unknown> = {
      ...props,
      value,
      disabled:
        typeof props.disabled === 'boolean' ? props.disabled : undefined,
      onTintColor: stringOf(bag.true),
      tintColor: stringOf(bag.false),
      thumbTintColor: stringOf(props.thumbColor),
      style:
        background === undefined
          ? props.style
          : [props.style, { backgroundColor: background, borderRadius: 16 }],
    };
    delete out.trackColor;
    delete out.thumbColor;
    delete out.ios_backgroundColor;
    return out;
  },
});

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────

// A bag the size a real row carries: what the rule reads, what it strips, and a style — so the
// measurement is of a fold marshalling a realistic object rather than a two-key toy.
const PRESSABLE_PROPS = {
  disabled: true,
  delayLongPress: 700,
  accessibilityLabel: 'row',
  style: { flexDirection: 'row', paddingLeft: 8, height: 44 },
};

const SWITCH_PROPS = {
  value: true,
  disabled: false,
  trackColor: { false: '#767577', true: '#81b0ff' },
  thumbColor: '#f5dd4b',
  ios_backgroundColor: '#3e3e3e',
  style: { margin: 4 },
};

type IArm = {
  readonly walk: number;
  readonly folds: number;
  readonly payload: Readonly<Record<string, unknown>>;
};

function buildList(
  rootTag: number,
  view: string,
  tag: string,
  props: Record<string, unknown>,
): IArm {
  const surface = createSurface(rootTag);
  const container: ISymbioteNode = createElement('RCTView', false, 'view');
  // The SURFACE takes its child through its own method — it is not an engine node, so the free
  // `appendChild` would name a slot this batch never created.
  surface.appendChild(container);

  let first: ISymbioteNode | undefined;
  for (let index = 0; index < ROWS; index += 1) {
    const node: ISymbioteNode = createElement(view, false, tag);
    for (const [name, value] of Object.entries(props))
      setProp(node, name, value);
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

// The gate on every measurement below: two arms that send different payloads are not one ruler.
function expectSamePayload(native: IArm, js: IArm): void {
  expect(Object.keys(native.payload).sort().join(' ')).toBe(
    Object.keys(js.payload).sort().join(' '),
  );
  for (const key of Object.keys(native.payload)) {
    expect(JSON.stringify(native.payload[key])).toBe(
      JSON.stringify(js.payload[key]),
    );
  }
}

function priced(
  name: string,
  view: string,
  tag: string,
  props: Record<string, unknown>,
  rootTag: number,
): void {
  const native = buildList(rootTag, view, tag, props);
  const js = buildList(rootTag + 1, view, `${tag}-in-js`, props);

  expectSamePayload(native, js);
  print(
    `DEBUG ${name.padEnd(10)} native walk=${native.walk.toFixed(1)} folds=${native.folds}` +
      `  js walk=${js.walk.toFixed(1)} folds=${js.folds}` +
      `  per node=${(((js.walk - native.walk) / ROWS) * 1_000).toFixed(1)} us`,
  );

  // The COUNT, not the clock. The rule runs on both arms and produced the same payload, so the
  // only difference left is the crossing; a wall-time bound would be a flake on a loaded machine,
  // and the count is what the port actually changed.
  expect(native.folds).toBe(0);
  expect(js.folds).toBe(ROWS);
}

describe('what a ported tag rule costs on each side of the wire', () => {
  it('pays no trip into JS for a thousand pressables', () => {
    priced('pressable', 'RCTView', 'pressable', PRESSABLE_PROPS, 1);
  });

  it('pays no trip into JS for a thousand switches', () => {
    priced('switch', 'Switch', 'switch', SWITCH_PROPS, 3);
  });
});

report();
