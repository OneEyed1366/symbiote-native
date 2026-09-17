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
//              native walk        js walk             per node   keys in the bag
//   accessory  3.1  3.1  3.1 ms   13.9 13.8 13.7 ms   ~10.7 us   4
//   pressable  3.8  3.7  5.6 ms   18.2 18.3 19.1 ms   ~14.1 us   4 + a 3-key style
//   switch     4.7  4.8  5.0 ms   23.5 23.4 24.1 ms   ~18.8 us   6 + nested trackColor
//   image      5.9  5.9  5.9 ms   27.7 27.7 27.9 ms   ~21.9 us   6 + what the rule builds
//
// So each rule itself is 3-6 ms and the CROSSING is three to five times that. Same shape the
// text-input port measured and the reason a fold's price is the TRIP and not the function: the bag
// goes out as a `jsi::Value` and comes back through `jsi::dynamicFromValue`, a per-key JSI walk, for
// a rule that rewrites a handful of keys.
//
// THE ACCESSORY ROW IS THE PROOF OF THAT SENTENCE, and it is why an arm with no rule earns a place
// in a file about rules. Its fold did NOTHING — it took the bag apart and put it back together
// unchanged, which is why the port deleted it instead of moving it — and it still cost 10.7 us per
// node. A fold is charged for existing. Read down the table and the per-node column tracks BAG SIZE
// and nothing else: the accessory's rule does the least work of the four and is the cheapest only
// because its bag is the smallest, while image's is the dearest because its rule BUILDS keys (a
// `source` object, a headers map, a style array) that all have to travel back.
//
// The corollary is worth stating, because it inverts the intuition that a trivial fold is a cheap
// one: the WORST value in this file is a fold that does nothing to a large bag. There is no rule
// there to be worth the crossing.
//
// The NATIVE column is tight run to run and the JS column nearly as much on this sitting; expect the
// JS one to drift more on a busier machine, since a JS fold allocates and carries GC that best-of-N
// cannot fully suppress.
//
// These four rows REPLACE an earlier three-row table (pressable 4.1/20.6, switch 5.6/27.1, image
// 6.9/32.2) taken in another sitting on a busier machine. Every figure in both is real and neither
// is the other's before/after — ONE RULER PER COMPARISON, which is why all four rules are priced in
// the same file, in the same process, in one sitting, and why the old rows were replaced rather than
// kept alongside.

import {
  registerImageBehavior,
  registerInputAccessoryViewBehavior,
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
registerImageBehavior();
registerInputAccessoryViewBehavior();

// ── the JS arms: the same rule, written on the other side of the wire ────────────────────────────
//
// These started as verbatim copies of what each behavior carried immediately before its port, and
// the switch arm is no longer that — its rule was CORRECTED after the move (RN's
// `accessibilityRole` default and the iOS `alignSelf` composition, `Switch.js:255,266`). The arm
// was updated to match, which is the point rather than a chore: `expectSamePayload` refuses to time
// two arms that send different bags, so the guard caught the divergence the moment it appeared.

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
      accessibilityRole: props.accessibilityRole ?? 'switch',
      // `alignSelf` UNDER the app's style, the pill OVER it — RN's nested `StyleSheet.compose`
      // (`Switch.js:266`). The iOS arm only; this fixture commits a `Switch`.
      style: [
        { alignSelf: 'flex-start' },
        props.style,
        ...(background === undefined
          ? []
          : [{ backgroundColor: background, borderRadius: 16 }]),
      ],
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

// The `image` arm's JS twin. `source` is NOT in it: the asset lookup moved to write time for both
// arms alike (`image-source-write.ts`), so it is not part of what either side of this comparison
// does — which is exactly why the two arms can be compared at all.
const IMAGE_ALIAS_KEYS = [
  'src',
  'srcSet',
  'crossOrigin',
  'referrerPolicy',
  'alt',
  'width',
  'height',
];

registerHostBehavior('image-in-js', {
  attach(): void {},
  detach(): void {},
  resolvesImageSources: true,
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = { ...props };
    const headers: Record<string, string> = {};
    if (props.crossOrigin === 'use-credentials') {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    if (typeof props.referrerPolicy === 'string') {
      headers['Referrer-Policy'] = props.referrerPolicy;
    }
    const size: Record<string, unknown> = {};
    if (typeof props.width === 'number') size.width = props.width;
    if (typeof props.height === 'number') size.height = props.height;

    out.source = [{ uri: props.src, ...size, headers }];
    if (Object.keys(size).length > 0) out.style = [size, props.style];
    if (typeof props.alt === 'string') {
      out.accessibilityLabel ??= props.alt;
      out.accessible = true;
    }
    for (const key of IMAGE_ALIAS_KEYS) delete out[key];
    return out;
  },
});

// THE ODD ONE OUT, and it is here precisely because it is odd: `input-accessory-view`'s native arm
// runs NO rule at all. Its fold was deleted rather than ported — read end to end it split the bag
// into consumed/passthrough and reassembled it unchanged — so this arm prices a REMOVAL, and the
// price of a fold that does nothing is the same trip a fold that does something pays. That is the
// finding: the crossing is charged for the trip, not for the work, so a no-op fold is the worst
// value in the file.
registerHostBehavior('input-accessory-view-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const consumed = new Set(['nativeID', 'backgroundColor', 'style']);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (!consumed.has(key)) out[key] = props[key];
    }
    const style = props.style;
    out.style =
      typeof style !== 'object' || style === null
        ? undefined
        : Array.isArray(style)
          ? style
          : { ...style };
    const nativeID = stringOf(props.nativeID);
    if (nativeID !== undefined) out.nativeID = nativeID;
    const background = stringOf(props.backgroundColor);
    if (background !== undefined) out.backgroundColor = background;
    return out;
  },
});

const INPUT_ACCESSORY_VIEW_PROPS = {
  nativeID: 'keyboard-bar',
  backgroundColor: '#eeeeee',
  accessibilityLabel: 'toolbar',
  style: { paddingTop: 4, height: 44 },
};

const SWITCH_PROPS = {
  value: true,
  disabled: false,
  trackColor: { false: '#767577', true: '#81b0ff' },
  thumbColor: '#f5dd4b',
  ios_backgroundColor: '#3e3e3e',
  style: { margin: 4 },
};

const IMAGE_PROPS = {
  src: 'https://example.test/hero.png',
  alt: 'a hero',
  width: 40,
  height: 20,
  crossOrigin: 'use-credentials',
  style: { opacity: 0.9 },
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

// A CANONICAL string: array order preserved, object keys sorted. `folly::dynamic` does not keep an
// object's authored key order, so a plain `JSON.stringify` comparison asserts the host's hash order
// and fails on two payloads that are equal — which it did, on the image arm's `source`. Arrays are
// deliberately NOT sorted: their order is part of the contract (native picks a source by scale).
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries({ ...value }).sort(([left], [right]) =>
    left < right ? -1 : 1,
  );
  return `{${entries.map(([key, held]) => `${key}:${canonical(held)}`).join(',')}}`;
}

// The gate on every measurement below: two arms that send different payloads are not one ruler.
function expectSamePayload(native: IArm, js: IArm): void {
  expect(Object.keys(native.payload).sort().join(' ')).toBe(
    Object.keys(js.payload).sort().join(' '),
  );
  for (const key of Object.keys(native.payload)) {
    expect(canonical(native.payload[key])).toBe(canonical(js.payload[key]));
  }
}

// BEST OF N, for the reason `child-list-scaling.itest.ts` spells out: timing noise is one-sided —
// it only ever ADDS — so the smallest of several runs is the closest reading to the work itself.
// Here the first sample is also the coldest, and it showed: an arm read 13.0 ms on its first pass
// and 4.3 on its third, in the same process.
//
// A fresh surface per sample, from a counter, so no two samples share a tree.
const SAMPLES = 4;
let nextRootTag = 1;

function bestArm(
  view: string,
  tag: string,
  props: Record<string, unknown>,
): IArm {
  let best: IArm | undefined;
  for (let run = 0; run < SAMPLES; run += 1) {
    const arm = buildList((nextRootTag += 1), view, tag, props);
    if (best === undefined || arm.walk < best.walk) best = arm;
  }
  if (best === undefined) throw new Error('no sample was taken');
  return best;
}

function priced(
  name: string,
  view: string,
  tag: string,
  props: Record<string, unknown>,
): void {
  const native = bestArm(view, tag, props);
  const js = bestArm(view, `${tag}-in-js`, props);

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
    priced('pressable', 'RCTView', 'pressable', PRESSABLE_PROPS);
  });

  it('pays no trip into JS for a thousand switches', () => {
    priced('switch', 'Switch', 'switch', SWITCH_PROPS);
  });

  it('pays no trip into JS for a thousand images', () => {
    priced('image', 'RCTImageView', 'image', IMAGE_PROPS);
  });

  it('pays no trip into JS for a thousand input accessory views', () => {
    priced(
      'accessory',
      'RCTInputAccessoryView',
      'input-accessory-view',
      INPUT_ACCESSORY_VIEW_PROPS,
    );
  });
});

report();
