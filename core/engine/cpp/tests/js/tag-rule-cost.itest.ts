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
//              native walk        js walk             per node   keys in the bag / what the rule does
//   content    2.8  2.9  3.2 ms   11.1 11.4 12.2 ms    ~8.6 us   3 + a 2-key style / READS ITS PARENT
//   imagebg    2.9  3.0  3.3 ms   12.2 12.9 13.2 ms    ~9.7 us   2 + a 3-key style / writes ONE key
//   spinner    3.8  3.8  4.1 ms   14.6 13.9 15.2 ms   ~10.7 us   4, no style / the MOST work here
//   accessory  3.4  3.2  3.2 ms   14.8 14.5 14.7 ms   ~11.4 us   4 / nothing at all
//   button     4.1  3.8  4.3 ms   16.8 16.1 16.6 ms   ~12.4 us   5 + a 2-key style
//   pressable  3.7  3.7  3.9 ms   17.8 18.2 19.9 ms   ~14.8 us   4 + a 3-key style
//   scroll     4.2  4.2  4.5 ms   19.1 19.2 20.9 ms   ~15.4 us   4 + a 2-key style / the BIGGEST rule
//   switch     4.8  4.8  5.1 ms   23.9 24.3 25.4 ms   ~19.6 us   6 + nested trackColor
//   image      5.9  6.1  6.4 ms   27.6 29.4 29.8 ms   ~22.9 us   6 + what the rule BUILDS
//   bgimage    7.5  7.6  7.9 ms   36.9 38.8 39.2 ms   ~30.6 us   6 + a 3-part style / TWO rules
//
// `bgimage` is the dearest row in the file and it is the model's own prediction rather than a
// surprise: its tag runs the image rule AND the background one, so it carries `image`'s bag plus a
// three-part style composed on top. Biggest bag, biggest price.
//
// It is also the SECOND parent-reading rule, and the pair settles what `content` alone could not.
// `content` reads its owner while doing almost nothing, so its cheapest-of-nine native walk could
// have been the rule's smallness rather than the read's. Here the read sits inside the most
// expensive rule in the file, and the arithmetic isolates it: `bgimage` native minus `image` native
// is ~1.4 ms over a thousand nodes, i.e. **~1.4 us per node for the parent read plus the style it
// builds**. A pointer hop on a tree already in memory, whatever is happening around it.
//
// `content` IS THE CHEAPEST NATIVE WALK OF THE NINE and it is the only rule that reads the node
// ABOVE it, which is the answer to the question the `ownerProps` seam had to earn: reading a parent
// costs nothing measurable. It is a pointer hop on a tree that is already in memory here — the same
// question cost a JS closure and a crossing for as long as the fold lived on the other side. That is
// the whole case for the seam, and it is why a rule being "derived from its owner" stopped being a
// reason to leave it in JS.
//
// `scroll` is the fourth point on that experiment and the one that closes it. Its rule is the
// BIGGEST in the file — compose a base style, default a flag, strip the axis, resolve an asymmetric
// pair, erase two keys, map a word to a friction constant — and it lands mid-table, next to
// `pressable`, whose rule does far less over a bag of the same size. Size of bag, not size of rule.
//
// THE TOP THREE ROWS ARE A DELIBERATE EXPERIMENT, not three ports that happened to be cheap. Their
// rules do, in order: almost nothing (ONE key written), the MOST work in the file (builds a style
// object, resolves a size two ways, writes two defaults, picks a colour), and literally nothing at
// all. They land within 1.4 us of each other. Whatever the price is a function of, it is not what the
// rule computes.
//
// It is what has to be MARSHALLED. Read the column against the bag and it orders cleanly, with the
// dearest row dear because its rule CREATES keys (a `source` object, a headers map, a style array)
// that then have to travel back. So the cost model for a fold is: bag in, bag out, and the body is
// free — which is why a trivial fold over a large bag is the worst value available, and why deleting
// one that does nothing (see `accessory`) is worth as much as porting one that does a lot.
//
// `button`'s arm carries BOTH its rules — the pressable one its tag also gets, then its own — which
// is why its JS twin composes the two folds rather than spelling only half. It still lands under
// `pressable` on the per-node column, because that column is bag size and its bag is smaller.
//
// So each rule itself is 3-6 ms and the CROSSING is three to five times that. Same shape the
// text-input port measured and the reason a fold's price is the TRIP and not the function: the bag
// goes out as a `jsi::Value` and comes back through `jsi::dynamicFromValue`, a per-key JSI walk, for
// a rule that rewrites a handful of keys.
//
// THE ACCESSORY ROW IS WHY AN ARM WITH NO RULE EARNS A PLACE IN A FILE ABOUT RULES. Its fold did
// NOTHING — it took the bag apart and put it back together unchanged, which is why the port deleted
// it instead of moving it — and it still cost ~11 us per node. A fold is charged for EXISTING.
//
// The NATIVE column is tight run to run and the JS column nearly as much on this sitting; expect the
// JS one to drift more on a busier machine, since a JS fold allocates and carries GC that best-of-N
// cannot fully suppress.
//
// This table REPLACES an earlier three-row one (pressable 4.1/20.6, switch 5.6/27.1, image 6.9/32.2)
// taken in another sitting on a busier machine. Every figure in both is real and neither is the
// other's before/after — ONE RULER PER COMPARISON, which is why every rule is priced in the same
// file, in the same process, in one sitting, and why the old rows were replaced rather than kept
// alongside. Adding a row means re-running all of them.

import {
  registerActivityIndicatorBehavior,
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
registerActivityIndicatorBehavior();

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

function pressableFoldInJs(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props };
  if (typeof props.disabled === 'boolean') {
    const authored = props.accessibilityState;
    const state: Record<string, unknown> =
      authored !== null && typeof authored === 'object' ? { ...authored } : {};
    state.disabled = props.disabled;
    out.accessibilityState = state;
  }
  for (const key of PRESSABLE_MACHINE_KEYS) delete out[key];
  out.accessible = props.accessible !== false;
  out.focusable = props.focusable !== false;
  return out;
}

registerHostBehavior('pressable-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload: pressableFoldInJs,
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

function imageFoldInJs(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
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
}

registerHostBehavior('image-in-js', {
  attach(): void {},
  detach(): void {},
  resolvesImageSources: true,
  foldPayload: imageFoldInJs,
});

// ImageBackground's INNER image, and the only arm here whose tag runs TWO rules — the ordinary image
// one and then the background's. So the twin composes both, in that order, which is also the record
// of the ordering divergence from RN that the image port left standing.
//
// The background half reads the owner through a CLOSURE, exactly as `imageFold(owner)` did before
// the `ownerProps` seam; the native half reads `node.parent`. That pairing is the whole point of the
// row — it is the SECOND parent-reading rule, and the first was measured on a rule that does almost
// nothing (`content`), so this one says whether the seam still costs nothing when the rule around it
// is the most expensive in the file.
registerHostBehavior('image-background-image-in-js', {
  attach(): void {},
  detach(): void {},
  resolvesImageSources: true,
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out = imageFoldInJs(props);
    const box: Record<string, unknown> = {};
    const ownerStyle = jsOwnerProps.style;
    if (typeof ownerStyle === 'object' && ownerStyle !== null) {
      const flat: Record<string, unknown> = Array.isArray(ownerStyle)
        ? Object.assign({}, ...ownerStyle)
        : { ...ownerStyle };
      if (flat.width !== undefined) box.width = flat.width;
      if (flat.height !== undefined) box.height = flat.height;
    }
    out.style = [
      { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
      box,
      out.style,
    ];
    return out;
  },
});

registerHostBehavior('image-background-image', {
  attach(): void {},
  detach(): void {},
  resolvesImageSources: true,
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

// The spinner, whose rule is the only one in this file that had to be REACHED before it could be
// priced: its tag is built by its owner and named by no app, so until a stub behavior was registered
// for it the host saw an empty `tagName` and ran nothing. See `activity-indicator/shared.ts`.
registerHostBehavior('activity-indicator-spinner-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = { ...props };
    const size = props.size;
    const box = size === 'large' ? 36 : typeof size === 'number' ? size : 20;
    if (typeof size === 'number') delete out.size;
    else out.size = size === 'large' ? 'large' : 'small';
    out.style = { width: box, height: box };
    out.animating = props.animating !== false;
    out.hidesWhenStopped = props.hidesWhenStopped !== false;
    if (typeof props.color !== 'string') out.color = '#999999';
    return out;
  },
});

// The SMALLEST rule in the file — one key, written unconditionally — and it is here as the control
// for the column's own claim. If price tracked what a rule DOES, this row would be nearly free.
registerHostBehavior('image-background-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    return { ...props, accessibilityIgnoresInvertColors: true };
  },
});

// Registered bare rather than through `registerImageBackgroundBehavior`, which would build an inner
// image per node and price a subtree instead of a rule — the same reason `button`'s arm is bare.
registerHostBehavior('image-background', {
  attach(): void {},
  detach(): void {},
});

const IMAGE_BACKGROUND_PROPS = {
  testID: 'hero',
  accessibilityLabel: 'a hero',
  style: { width: 120, height: 80, borderRadius: 4 },
};

// The BIGGEST rule in the file by what it does — compose a base style, default a flag, strip the
// axis, resolve an asymmetric pair, erase two keys, map a word to a friction constant.
registerHostBehavior('scroll-view-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = {
      ...props,
      style: [
        {
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: 'column',
          overflow: 'scroll',
        },
        props.style,
      ],
      nestedScrollEnabled: props.nestedScrollEnabled ?? true,
    };
    delete out.horizontal;
    if (props.alwaysBounceVertical === undefined)
      out.alwaysBounceVertical = true;
    delete out.stickyHeaderIndices;
    delete out.invertStickyHeaders;
    if (props.decelerationRate === 'normal') out.decelerationRate = 0.998;
    else if (props.decelerationRate === 'fast') out.decelerationRate = 0.99;
    return out;
  },
});

// Registered bare, like `button`'s and `image-background`'s arms: the real behavior builds a content
// node per scroll view, and this file prices ONE rule against ONE fold, not a subtree.
registerHostBehavior('scroll-view', { attach(): void {}, detach(): void {} });

// THE FIRST RULE HERE THAT READS ITS PARENT, and the reason it is priced beside the others rather
// than trusted: `ownerProps` is a pointer hop in C++ and a whole JS closure plus a crossing in the
// arm it replaced, so the two sides are not comparable in the way the other rows are. What the row
// answers is the only question that matters for the seam — does reading the parent cost anything
// measurable against a rule that does not.
//
// The JS twin reads the owner through a closure, which is what `contentFold` did.
let jsOwnerProps: Readonly<Record<string, unknown>> = {};

registerHostBehavior('scroll-content-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const preserves =
      jsOwnerProps.maintainVisibleContentPosition !== undefined ||
      jsOwnerProps.snapToAlignment !== undefined;
    if (!preserves) return props;
    return { ...props, collapsableChildren: false };
  },
});

registerHostBehavior('scroll-content', {
  attach(): void {},
  detach(): void {},
});

const SCROLL_CONTENT_PROPS = {
  collapsable: false,
  testID: 'content',
  style: { padding: 8, gap: 4 },
};

const SCROLL_VIEW_PROPS = {
  decelerationRate: 'fast',
  stickyHeaderIndices: [0],
  testID: 'list',
  style: { height: 400, backgroundColor: '#ffffff' },
};

const SPINNER_PROPS = {
  size: 'large',
  animating: true,
  accessibilityLabel: 'loading',
  testID: 'spin',
};

const INPUT_ACCESSORY_VIEW_PROPS = {
  nativeID: 'keyboard-bar',
  backgroundColor: '#eeeeee',
  accessibilityLabel: 'toolbar',
  style: { paddingTop: 4, height: 44 },
};

// Button's own rules, over the pressable ones its tag also gets. Priced on a BARE tag rather than
// through `registerButtonBehavior`, deliberately: that behavior builds three derived nodes, so a
// real `<button>` pays FOUR crossings per commit (`button-payload.itest.ts`) and this file measures
// ONE rule against ONE fold. Mixing the two would price the subtree, not the port.
//
// THE STUB IS NOT OPTIONAL, and finding that out is worth recording: a tag reaches C++ only through
// `recordSetTag`, which `attachHostBehavior` emits. A node built with a tag NOBODY registered
// carries an empty `tagName` in the host, so no tag rule fires — the first run of this arm measured
// a native side doing nothing at all, and `expectSamePayload` is what caught it rather than a
// suspiciously fast number.
registerHostBehavior('button', { attach(): void {}, detach(): void {} });

registerHostBehavior('button-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    // The pressable fold FIRST, because the native arm's tag gets both — `button` is served by
    // `usesPressableRule` and then by `foldButtonProps`, in that order. An arm that applied only
    // half would send a different bag, and `expectSamePayload` would refuse to time it.
    const out: Record<string, unknown> = pressableFoldInJs(props);
    out.accessibilityRole = 'button';
    if (out.importantForAccessibility === 'no')
      out.importantForAccessibility = 'no-hide-descendants';
    if (Object.hasOwn(out, 'touchSoundDisabled')) {
      out.android_disableSound = out.touchSoundDisabled;
      delete out.touchSoundDisabled;
    }
    delete out.color;
    return out;
  },
});

const BUTTON_PROPS = {
  color: '#ff0000',
  touchSoundDisabled: true,
  importantForAccessibility: 'no',
  accessibilityLabel: 'save',
  style: { paddingLeft: 8, height: 44 },
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
  // Props for the CONTAINER every row hangs off, which is the parent a rule reads through
  // `ownerProps`. Empty for every arm but `content`, whose whole subject is that read — and without
  // it that arm would measure a rule taking its early-out, i.e. nothing.
  ownerProps: Record<string, unknown> = {},
): IArm {
  const surface = createSurface(rootTag);
  const container: ISymbioteNode = createElement('RCTView', false, 'view');
  for (const [name, value] of Object.entries(ownerProps))
    setProp(container, name, value);
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
  ownerProps: Record<string, unknown> = {},
): IArm {
  let best: IArm | undefined;
  for (let run = 0; run < SAMPLES; run += 1) {
    const arm = buildList((nextRootTag += 1), view, tag, props, ownerProps);
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
  ownerProps: Record<string, unknown> = {},
): void {
  // The JS arm reads its owner through a CLOSURE, which is what the fold it replaces did, so the
  // value has to be handed to it out of band — there is no parent for it to consult.
  jsOwnerProps = ownerProps;
  const native = bestArm(view, tag, props, ownerProps);
  const js = bestArm(view, `${tag}-in-js`, props, ownerProps);

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

  it('pays no trip into JS for a thousand scroll content nodes', () => {
    priced(
      'content',
      'RCTScrollContentView',
      'scroll-content',
      SCROLL_CONTENT_PROPS,
      {
        snapToAlignment: 'center',
      },
    );
  });

  it('pays no trip into JS for a thousand scroll views', () => {
    priced('scroll', 'RCTScrollView', 'scroll-view', SCROLL_VIEW_PROPS);
  });

  it('pays no trip into JS for a thousand image backgrounds', () => {
    priced('imagebg', 'RCTView', 'image-background', IMAGE_BACKGROUND_PROPS);
  });

  it('pays no trip into JS for a thousand image-background images', () => {
    priced(
      'bgimage',
      'RCTImageView',
      'image-background-image',
      IMAGE_PROPS,
      // The box the proxy exists to counter. Without it this arm would measure the rule taking its
      // early-out, which is the same trap the `content` arm's comment records.
      { style: { width: 120, height: 80 } },
    );
  });

  it('pays no trip into JS for a thousand spinners', () => {
    priced(
      'spinner',
      'ActivityIndicatorView',
      'activity-indicator-spinner',
      SPINNER_PROPS,
    );
  });

  it('pays no trip into JS for a thousand buttons', () => {
    priced('button', 'RCTView', 'button', BUTTON_PROPS);
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
