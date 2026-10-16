// A/B of each tag rule in C++ against the same rule as a JS `payloadFold`, one tree, one process
// Payloads are asserted equal key by key before any clock is read; the JS arms exist only here
// Figures and the cost model live in the `symbiote-engine-tag-rules` skill

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

// The JS arms: the same rule, written on the other side of the wire
// `expectSamePayload` refuses to time arms that disagree, which is how a stale twin shows up

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
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out = pressableFoldInJs(props);
    // Bare tag only: `button-in-js` reuses `pressableFoldInJs` and must not inherit it
    out.collapsable = false;
    return out;
  },
});

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

registerHostBehavior('switch-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const isOn = props.value === true;
    const track = props.trackColor;
    const bag: Record<string, unknown> =
      track !== null && typeof track === 'object' ? { ...track } : {};
    const background = stringOf(props.ios_backgroundColor);
    const out: Record<string, unknown> = {
      ...props,
      value: isOn,
      disabled:
        typeof props.disabled === 'boolean' ? props.disabled : undefined,
      onTintColor: stringOf(bag.true),
      tintColor: stringOf(bag.false),
      thumbTintColor: stringOf(props.thumbColor),
      accessibilityRole: props.accessibilityRole ?? 'switch',
      // `alignSelf` under the app's style, the pill over it, the iOS arm only
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

// A bag the size a real row carries, so the fold marshals a realistic object
const PRESSABLE_PROPS = {
  disabled: true,
  delayLongPress: 700,
  accessibilityLabel: 'row',
  style: { flexDirection: 'row', paddingLeft: 8, height: 44 },
};

// No `source` here: the asset lookup moved to write time for both arms
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
  out.resizeMode = 'cover';
  out.style = [{ overflow: 'hidden' }, size, props.style];
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

// The owner as the JS folds saw it, through a closure: a JS fold has no parent to consult
let jsOwnerProps: Readonly<Record<string, unknown>> = {};

// The only tag with two rules: the image one, then the background one
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

// An array goes through as it is, an object is copied, anything else is no style at all
function copyOfStyle(style: unknown): unknown {
  if (typeof style !== 'object' || style === null) return undefined;
  if (Array.isArray(style)) return style;
  return { ...style };
}

// The native rule forces `position: 'absolute'` under the authored style
registerHostBehavior('input-accessory-view-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const consumed = new Set(['nativeID', 'backgroundColor', 'style']);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (!consumed.has(key)) out[key] = props[key];
    }
    const authoredStyle = copyOfStyle(props.style);
    out.style =
      authoredStyle === undefined
        ? [{ position: 'absolute' }]
        : [authoredStyle, { position: 'absolute' }];
    const nativeID = stringOf(props.nativeID);
    if (nativeID !== undefined) out.nativeID = nativeID;
    const background = stringOf(props.backgroundColor);
    if (background !== undefined) out.backgroundColor = background;
    return out;
  },
});

// The spinner's tag is built by its owner, so a stub behavior has to name it for the host
registerHostBehavior('activity-indicator-spinner-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = { ...props };
    const size = props.size;
    const fallbackBox = size === 'large' ? 36 : 20;
    const box = typeof size === 'number' ? size : fallbackBox;
    if (typeof size === 'number') delete out.size;
    else out.size = size === 'large' ? 'large' : 'small';
    out.style = { width: box, height: box };
    out.animating = props.animating !== false;
    out.hidesWhenStopped = props.hidesWhenStopped !== false;
    if (typeof props.color !== 'string') out.color = '#999999';
    return out;
  },
});

// The smallest rule here, one key written unconditionally: the control row
registerHostBehavior('image-background-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    return { ...props, accessibilityIgnoresInvertColors: true };
  },
});

// Bare: the real behavior builds an inner image per node and would price a subtree
registerHostBehavior('image-background', {
  attach(): void {},
  detach(): void {},
});

const IMAGE_BACKGROUND_PROPS = {
  testID: 'hero',
  accessibilityLabel: 'a hero',
  style: { width: 120, height: 80, borderRadius: 4 },
};

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
    };
    delete out.horizontal;
    if (props.alwaysBounceVertical === undefined)
      out.alwaysBounceVertical = true;
    // The fixture wires no momentum listener
    out.sendMomentumEvents = false;
    if (
      Array.isArray(props.stickyHeaderIndices) &&
      props.stickyHeaderIndices.length > 0
    )
      out.scrollEventThrottle = 1;
    out.snapToStart = props.snapToStart !== false;
    out.snapToEnd = props.snapToEnd !== false;
    delete out.stickyHeaderIndices;
    delete out.invertStickyHeaders;
    if (props.decelerationRate === 'normal') out.decelerationRate = 0.998;
    else if (props.decelerationRate === 'fast') out.decelerationRate = 0.99;
    // The iOS half of the paging expression, resolved on every scroll view
    out.pagingEnabled =
      props.pagingEnabled === true &&
      props.snapToInterval === undefined &&
      props.snapToOffsets === undefined;
    return out;
  },
});

// Bare, like `image-background`: the real behavior builds a content node per scroll view
registerHostBehavior('scroll-view', { attach(): void {}, detach(): void {} });

// The rule that reads its parent: a pointer hop in C++, a closure plus a crossing in JS
registerHostBehavior('scroll-content-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    // No `snapToAlignment` leg: the engine's rule reads it on Android only
    const hasPreservedPosition =
      jsOwnerProps.maintainVisibleContentPosition !== undefined;
    if (hasPreservedPosition) return { ...props, collapsableChildren: false };
    return props;
  },
});

registerHostBehavior('scroll-content', {
  attach(): void {},
  detach(): void {},
});

// No arm for `touchable-opacity`'s `focusable`: it would mirror the whole pressable rule
// to price a one-key fold. Its multiplier is in `touchable-focusable-payload.itest.ts`

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

// Bare tag, not `registerButtonBehavior`: that builds three derived nodes per button
// An unregistered tag reaches C++ empty, so no rule fires on the native arm
registerHostBehavior('button', { attach(): void {}, detach(): void {} });

// The fixture writes no press handler, so the native `hasPressListener` leg reads false
const HAS_PRESS_LISTENER_IN_FIXTURE = false;

registerHostBehavior('button-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    // The pressable fold first: the native tag gets both rules, in that order
    const out: Record<string, unknown> = pressableFoldInJs(props);
    out.accessibilityRole = 'button';
    if (out.importantForAccessibility === 'no')
      out.importantForAccessibility = 'no-hide-descendants';
    if (Object.hasOwn(out, 'touchSoundDisabled')) {
      out.android_disableSound = out.touchSoundDisabled;
      delete out.touchSoundDisabled;
    }
    delete out.color;
    // Three legs over the one the pressable fold wrote
    out.focusable =
      out.focusable !== false &&
      HAS_PRESS_LISTENER_IN_FIXTURE &&
      buttonDisabledInJs(props) !== true;
    return out;
  },
});

// The one descendant rule, dispatched from the parent's tag: the native arm needs a tagged
// container and the row's own tag carries no rule
registerHostBehavior('touchable-native-feedback', {
  attach(): void {},
  detach(): void {},
});
registerHostBehavior('clone', { attach(): void {}, detach(): void {} });

const CLONE_KEYS_IN_JS: readonly string[] = [
  'accessibilityHint',
  'accessibilityLanguage',
  'accessibilityLabel',
  'accessibilityRole',
  'accessibilityActions',
  'accessibilityValue',
  'importantForAccessibility',
  'accessibilityViewIsModal',
  'accessibilityLiveRegion',
  'accessibilityElementsHidden',
  'hasTVPreferredFocus',
  'hitSlop',
  'nextFocusDown',
  'nextFocusForward',
  'nextFocusLeft',
  'nextFocusRight',
  'nextFocusUp',
  'testID',
];

registerHostBehavior('clone-in-js', {
  attach(): void {},
  detach(): void {},
  foldPayload(props: Readonly<Record<string, unknown>>) {
    const out: Record<string, unknown> = { ...props };
    for (const key of CLONE_KEYS_IN_JS) {
      if (jsOwnerProps[key] === undefined) delete out[key];
      else out[key] = jsOwnerProps[key];
    }
    const disabled =
      typeof jsOwnerProps.disabled === 'boolean'
        ? jsOwnerProps.disabled
        : undefined;
    out.accessible = jsOwnerProps.accessible !== false;
    out.focusable =
      jsOwnerProps.focusable !== false &&
      HAS_PRESS_LISTENER_IN_FIXTURE &&
      disabled !== true;
    if (typeof jsOwnerProps.nativeID === 'string')
      out.nativeID = jsOwnerProps.nativeID;
    else delete out.nativeID;
    if (disabled !== undefined) {
      const authored = jsOwnerProps.accessibilityState;
      out.accessibilityState = {
        ...(typeof authored === 'object' && authored !== null ? authored : {}),
        disabled,
      };
    } else if (jsOwnerProps.accessibilityState === undefined) {
      delete out.accessibilityState;
    } else {
      out.accessibilityState = jsOwnerProps.accessibilityState;
    }
    return out;
  },
});

// Eight of RN's clone names plus the four it computes, a realistic owner bag
const CLONE_OWNER_PROPS: Record<string, unknown> = {
  accessibilityLabel: 'Save',
  accessibilityHint: 'Saves the draft',
  accessibilityRole: 'button',
  importantForAccessibility: 'yes',
  hitSlop: 8,
  nextFocusDown: 12,
  testID: 'owner',
  nativeID: 'tnf',
  accessibilityState: { busy: true },
  disabled: false,
};

// Read off the authored bag: the folds above erase `disabled` into `accessibilityState`
function buttonDisabledInJs(
  props: Readonly<Record<string, unknown>>,
): boolean | undefined {
  if (typeof props.disabled === 'boolean') return props.disabled;
  if (typeof props['aria-disabled'] === 'boolean')
    return props['aria-disabled'];
  const state = props.accessibilityState;
  if (typeof state !== 'object' || state === null) return undefined;
  const disabled = Reflect.get(state, 'disabled');
  return typeof disabled === 'boolean' ? disabled : undefined;
}

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

// `ownerProps` feed the container every row hangs off, the parent a rule reads
// `ownerTag` is its tag, a plain `view` except for the descendant `clone` rule
type IRowSpec = {
  readonly view: string;
  readonly tag: string;
  readonly props: Record<string, unknown>;
  readonly ownerProps?: Record<string, unknown>;
  readonly ownerTag?: string;
};

function buildList(rootTag: number, spec: IRowSpec): IArm {
  const { view, tag, props, ownerProps = {}, ownerTag = 'view' } = spec;
  const surface = createSurface(rootTag);
  const container: ISymbioteNode = createElement('RCTView', false, ownerTag);
  for (const [name, value] of Object.entries(ownerProps))
    setProp(container, name, value);
  // The surface is not an engine node, so it takes its child through its own method
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

// Array order is part of the contract (native picks a source by scale), key order is not
// `folly::dynamic` does not keep an object's authored key order
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries({ ...value }).sort(([left], [right]) =>
    left < right ? -1 : 1,
  );
  const fields = entries.map(([key, held]) => `${key}:${canonical(held)}`);
  return `{${fields.join(',')}}`;
}

function expectSamePayload(native: IArm, js: IArm): void {
  expect(Object.keys(native.payload).sort().join(' ')).toBe(
    Object.keys(js.payload).sort().join(' '),
  );
  for (const key of Object.keys(native.payload)) {
    expect(canonical(native.payload[key])).toBe(canonical(js.payload[key]));
  }
}

// Best of N: timing noise only ever adds, and the first sample is the coldest
// A fresh surface per sample, so no two share a tree
const SAMPLES = 4;
let nextRootTag = 1;

function bestArm(spec: IRowSpec): IArm {
  let best: IArm | undefined;
  for (let run = 0; run < SAMPLES; run += 1) {
    const arm = buildList((nextRootTag += 1), spec);
    if (best === undefined || arm.walk < best.walk) best = arm;
  }
  if (best === undefined) throw new Error('no sample was taken');
  return best;
}

function priced(name: string, spec: IRowSpec): void {
  jsOwnerProps = spec.ownerProps ?? {};
  const native = bestArm(spec);
  // A plain `view` container on the JS arm keeps the descendant rule from firing natively
  const js = bestArm({ ...spec, tag: `${spec.tag}-in-js`, ownerTag: 'view' });

  expectSamePayload(native, js);
  print(
    `DEBUG ${name.padEnd(10)} native walk=${native.walk.toFixed(1)} folds=${native.folds}` +
      `  js walk=${js.walk.toFixed(1)} folds=${js.folds}` +
      `  per node=${(((js.walk - native.walk) / ROWS) * 1_000).toFixed(1)} us`,
  );

  // The count, not the clock: a wall-time bound flakes on a loaded machine
  expect(native.folds).toBe(0);
  expect(js.folds).toBe(ROWS);
}

describe('what a ported tag rule costs on each side of the wire', () => {
  it('pays no trip into JS for a thousand pressables', () => {
    priced('pressable', {
      view: 'RCTView',
      tag: 'pressable',
      props: PRESSABLE_PROPS,
    });
  });

  it('pays no trip into JS for a thousand switches', () => {
    priced('switch', { view: 'Switch', tag: 'switch', props: SWITCH_PROPS });
  });

  it('pays no trip into JS for a thousand images', () => {
    priced('image', {
      view: 'RCTImageView',
      tag: 'image',
      props: IMAGE_PROPS,
    });
  });

  it('pays no trip into JS for a thousand scroll content nodes', () => {
    priced('content', {
      view: 'RCTScrollContentView',
      tag: 'scroll-content',
      props: SCROLL_CONTENT_PROPS,
      // Platform-invariant anchor prop; `snapToAlignment` would split the arms on Android
      ownerProps: { maintainVisibleContentPosition: { minIndexForVisible: 0 } },
    });
  });

  it('pays no trip into JS for a thousand scroll views', () => {
    priced('scroll', {
      view: 'RCTScrollView',
      tag: 'scroll-view',
      props: SCROLL_VIEW_PROPS,
    });
  });

  it('pays no trip into JS for a thousand image backgrounds', () => {
    priced('imagebg', {
      view: 'RCTView',
      tag: 'image-background',
      props: IMAGE_BACKGROUND_PROPS,
    });
  });

  it('pays no trip into JS for a thousand image-background images', () => {
    priced('bgimage', {
      view: 'RCTImageView',
      tag: 'image-background-image',
      props: IMAGE_PROPS,
      // Without a box the rule takes its early-out and the arm prices nothing
      ownerProps: { style: { width: 120, height: 80 } },
    });
  });

  it('pays no trip into JS for a thousand spinners', () => {
    priced('spinner', {
      view: 'ActivityIndicatorView',
      tag: 'activity-indicator-spinner',
      props: SPINNER_PROPS,
    });
  });

  it('pays no trip into JS for a thousand buttons', () => {
    priced('button', { view: 'RCTView', tag: 'button', props: BUTTON_PROPS });
  });

  // The native container is a `touchable-native-feedback`, the JS one a plain `view`
  it('pays no trip into JS for a thousand cloned children', () => {
    priced('clone', {
      view: 'RCTView',
      tag: 'clone',
      props: { backgroundColor: 'red' },
      ownerProps: CLONE_OWNER_PROPS,
      ownerTag: 'touchable-native-feedback',
    });
  });

  it('pays no trip into JS for a thousand input accessory views', () => {
    priced('accessory', {
      view: 'RCTInputAccessoryView',
      tag: 'input-accessory-view',
      props: INPUT_ACCESSORY_VIEW_PROPS,
    });
  });
});

report();
