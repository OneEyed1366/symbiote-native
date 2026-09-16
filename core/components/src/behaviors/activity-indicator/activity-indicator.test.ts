// ActivityIndicator's host behavior — the second consumer of `buildStructure` / `childHost`, and
// the first composed primitive whose slot exists for a PROP redirect rather than for children.
//
// WHAT THIS PROVES: the engine builds, from the tag alone, the two-node tree RN itself renders
// (`ActivityIndicator.js:112`) and commits the right payload on both nodes. Every one of this
// primitive's folds — the size translation, the two `!== false` defaults, the platform colour,
// Android's two required native props — used to live in five wrapper bodies, and a tag inherits
// nothing a component did.
//
// NO COMPONENT ARM ANY MORE, and its absence is not a coverage loss. The two arms existed while
// `renderActivityIndicator` painted the same tree for five wrappers, so the comparison answered
// "did one path drop a fold". The wrappers and the render fn are gone in the same commit that
// registered this behavior, so there is no second path to compare against and the ABSOLUTE
// expectations below — which every case already carried, because a fold BOTH arms lost still
// compares equal — are the whole oracle.
//
// PLATFORM ARMS ARE BY FILE, not by a `Platform.OS` mock, because the behavior's platform half is a
// folder-as-module split. The intrinsic->native-name table still resolves to the iOS build under
// vitest, so the Android arm's spinner serializes as `ActivityIndicatorView`; nothing below keys off
// that name — the Android claims are about the colour omission and the two native extras.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearGlobalStyles,
  clearHostBehaviors,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  type ISymbioteNode,
  childrenOf,
  propsOf,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerActivityIndicatorBehavior as registerIos } from './index.ios';
import { registerActivityIndicatorBehavior as registerAndroid } from './index.android';
import {
  ACTIVITY_INDICATOR_SPINNER_TAG,
  ACTIVITY_INDICATOR_TAG,
  type IActivityIndicatorPlatform,
  type IActivityIndicatorProps,
} from './shared';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// The slot's props, asked of the host — JS holds no tree, and each call site has already
// established that the slot exists.
function slotPropsOf(owner: ISymbioteNode): Readonly<Record<string, unknown>> {
  const slot = owner.childHost;
  if (slot === undefined) throw new Error('the host built no slot');
  return propsOf(slot);
}
let nextRootTag = 9400;

const TEST_ID = 'indicator';
const SPINNER_VIEW = descriptorFor(ACTIVITY_INDICATOR_SPINNER_TAG).component;
const HOST_VIEW = descriptorFor(ACTIVITY_INDICATOR_TAG).component;

// The two platform halves, restated rather than imported: these are the ABSOLUTE expectations the
// harness asks for, so reading them out of the module under test would make every assertion below
// pass with the module deleted.
const IOS: IActivityIndicatorPlatform = {
  defaultColor: '#999999',
  nativeExtras: {},
};
const ANDROID: IActivityIndicatorPlatform = {
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
};

// RN's centering wrapper, flattened as the payload sees it (ActivityIndicator.js styles.container).
const CENTERED = { alignItems: 'center', justifyContent: 'center' };
const SIZE_SMALL_BOX = { width: 20, height: 20 };
const SIZE_LARGE_BOX = { width: 36, height: 36 };

const CARD_CLASS = 'card';

afterEach(() => {
  clearHostBehaviors();
  clearGlobalStyles();
  fabric.reset();
});

// One node, the props written on it exactly as an app writes them on the tag. Nothing here names
// the spinner — that is the behavior's job, and its absence is the test. Returns both handles
// directly, so a caller reads `payloadOf(host)` / `payloadOf(spinner)` for the committed props —
// no tree search needed, since `buildStructure` hands the spinner straight back as `childHost`.
function mountTag(props: IActivityIndicatorProps): {
  host: ISymbioteNode;
  spinner: ISymbioteNode;
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const host = createElement(HOST_VIEW, false, ACTIVITY_INDICATOR_TAG);
  for (const key of Object.keys(props))
    routeProp(host, key, Reflect.get(props, key));
  appendChild(root, host);
  const spinner = host.childHost;
  expect(
    spinner?.component,
    'the behavior never built a spinner — is it registered?',
  ).toBe(SPINNER_VIEW);
  if (spinner === undefined) throw new Error('the host built no slot');
  surface.commit();
  return { host, spinner };
}

describe('the tag builds RN’s two-node structure', () => {
  beforeEach(registerIos);

  it('builds the spinner under the host and hosts the slot on it', () => {
    const host = createElement(HOST_VIEW, false, ACTIVITY_INDICATOR_TAG);

    expect(childrenOf(host)).toHaveLength(1);
    expect(host.childHost).toBe(childrenOf(host)[0]);
    expect(host.childHost?.component).toBe(SPINNER_VIEW);
  });

  it('commits RCTView(spinner), the two nodes RN itself renders', () => {
    const { host } = mountTag({ testID: TEST_ID });

    expect(live.serialize(host)).toBe(`${HOST_VIEW}(${SPINNER_VIEW})`);
  });

  it('moves everything but the host list OFF the host, RN’s own split', () => {
    const host = createElement(HOST_VIEW, false, ACTIVITY_INDICATOR_TAG);
    routeProp(host, 'animating', false);
    routeProp(host, 'size', 'large');
    routeProp(host, 'color', 'red');
    routeProp(host, 'hidesWhenStopped', false);
    // Not a spinner prop by any reading — it is here because `slotPropsExcept` is a COMPLEMENT, so
    // an arbitrary name the map never anticipated travels too. That is what RN's `...restProps`
    // does (`ActivityIndicator.js:99`) and what a rename map could not express.
    routeProp(host, 'testID', TEST_ID);
    routeProp(host, 'onLayout', () => {});

    expect(propsOf(host)).toEqual({ onLayout: true });
    expect(slotPropsOf(host)).toMatchObject({
      animating: false,
      size: 'large',
      color: 'red',
      hidesWhenStopped: false,
      testID: TEST_ID,
    });
  });
});

describe('the size fold, which is the whole reason `size` is not a native prop', () => {
  beforeEach(registerIos);

  it.each([
    { size: 'small' as const, box: SIZE_SMALL_BOX },
    { size: 'large' as const, box: SIZE_LARGE_BOX },
  ])(
    '$size maps to BOTH the native enum and the fixed box',
    ({ size, box }) => {
      const { spinner } = mountTag({ testID: TEST_ID, size });
      const payload = payloadOf(spinner);

      expect(payload.size).toBe(size);
      expect(payload).toMatchObject(box);
    },
  );

  it('a NUMBER sizes through style only and sends no enum at all', () => {
    const { spinner } = mountTag({ testID: TEST_ID, size: 24 });
    const payload = payloadOf(spinner);

    expect(payload).toMatchObject({ width: 24, height: 24 });
    expect(Object.hasOwn(payload, 'size')).toBe(false);
  });

  it('defaults to small when the app writes no size, as RN does', () => {
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(payload.size).toBe('small');
    expect(payload).toMatchObject(SIZE_SMALL_BOX);
  });
});

describe('the two defaults a tag has no destructure for', () => {
  beforeEach(registerIos);

  it('animating and hidesWhenStopped are true when unwritten', () => {
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(payload.animating).toBe(true);
    expect(payload.hidesWhenStopped).toBe(true);
  });

  it('an explicit false still wins', () => {
    const payload = payloadOf(
      mountTag({
        testID: TEST_ID,
        animating: false,
        hidesWhenStopped: false,
      }).spinner,
    );

    expect(payload.animating).toBe(false);
    expect(payload.hidesWhenStopped).toBe(false);
  });
});

describe('the host keeps the centering style, and only that', () => {
  beforeEach(registerIos);

  it('composes RN styles.container UNDER the app style, so the app still wins', () => {
    const { host, spinner } = mountTag({
      testID: TEST_ID,
      nativeID: 'native',
      // Collides with the container's own alignItems — the app must win.
      style: { alignItems: 'flex-start', margin: 4 },
    });
    const hostPayload = payloadOf(host);

    expect(hostPayload).toMatchObject({
      justifyContent: 'center',
      alignItems: 'flex-start',
      margin: 4,
    });
    // The two RN hands to the spinner instead (`ActivityIndicator.js:99`). Asserted as ABSENT here
    // rather than only as present there: a fold that lands a key on BOTH nodes reads correct from
    // the spinner's side alone.
    expect(Object.hasOwn(hostPayload, 'testID')).toBe(false);
    expect(Object.hasOwn(hostPayload, 'nativeID')).toBe(false);
    expect(payloadOf(spinner)).toMatchObject({
      testID: TEST_ID,
      nativeID: 'native',
    });
  });

  it('centres with no app style at all', () => {
    expect(payloadOf(mountTag({ testID: TEST_ID }).host)).toMatchObject(
      CENTERED,
    );
  });

  // A class NAME is the only entry on the host list that is not RN's own: `routeProp`'s class
  // branch resolves it to a STYLE, so a class routed to the spinner would style the 20x20 box
  // instead of the centering view. Both spellings, because the list carries both and one case
  // cannot witness the other.
  it.each(['class', 'className'])(
    'resolves a %s against the centering view, not the spinner',
    spelling => {
      registerRules([
        {
          tokens: [CARD_CLASS],
          specificity: [0, 1, 0],
          order: 0,
          style: { backgroundColor: 'red' },
        },
      ]);
      const { host, spinner } = mountTag({
        testID: TEST_ID,
        [spelling]: CARD_CLASS,
      });

      expect(payloadOf(host)).toMatchObject({
        backgroundColor: 'red',
        ...CENTERED,
      });
      expect(Object.hasOwn(payloadOf(spinner), 'backgroundColor')).toBe(false);
    },
  );
});

describe('the platform half: iOS', () => {
  beforeEach(registerIos);

  it("fills in RN's GRAY when the app names no colour", () => {
    expect(payloadOf(mountTag({ testID: TEST_ID }).spinner).color).toBe(
      '#999999',
    );
  });

  it('an explicit colour wins over the default', () => {
    expect(
      payloadOf(mountTag({ testID: TEST_ID, color: '#ff0000' }).spinner).color,
    ).toBe('#ff0000');
  });

  it('sends no native extras — those are AndroidProgressBar requirements', () => {
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(Object.hasOwn(payload, 'styleAttr')).toBe(false);
    expect(Object.hasOwn(payload, 'indeterminate')).toBe(false);
  });
});

describe('the platform half: Android', () => {
  beforeEach(registerAndroid);

  it('OMITS colour entirely on the theme default — a null is rejected by the colour parser', () => {
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(Object.hasOwn(payload, 'color')).toBe(false);
  });

  it('an explicit colour still reaches the spinner', () => {
    expect(
      payloadOf(mountTag({ testID: TEST_ID, color: '#00ff00' }).spinner).color,
    ).toBe('#00ff00');
  });

  it('sends styleAttr and indeterminate, without which the view throws setStyle()', () => {
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(payload.styleAttr).toBe('Normal');
    expect(payload.indeterminate).toBe(true);
  });
});

// The payload oracle, case by case.
//
// TWO expectations rather than one, because the split RN makes is the thing under test: the
// payload naming `testID` is the SPINNER's. So the host needs its own assertion, or a tree that
// put the centering style nowhere would still pass.
describe('the tag commits RN’s payload on both of its nodes', () => {
  const CASES: Array<{
    name: string;
    props: IActivityIndicatorProps;
    host: Record<string, unknown>;
    spinner: Record<string, unknown>;
  }> = [
    {
      name: 'defaults only',
      props: { testID: TEST_ID },
      // Produced by the folds, never restating the input: the app wrote none of these.
      host: { ...CENTERED },
      spinner: { animating: true, hidesWhenStopped: true, ...SIZE_SMALL_BOX },
    },
    {
      name: 'a named size and an explicit colour',
      props: { testID: TEST_ID, size: 'large', color: '#123456' },
      host: { ...CENTERED },
      spinner: { color: '#123456', ...SIZE_LARGE_BOX },
    },
    {
      name: 'a numeric size, which never reaches the native enum',
      props: { testID: TEST_ID, size: 48, animating: false },
      host: { ...CENTERED },
      spinner: { animating: false, width: 48, height: 48 },
    },
    {
      name: 'an app style over the centering container',
      props: { testID: TEST_ID, style: { margin: 8 }, hidesWhenStopped: false },
      host: { ...CENTERED, margin: 8 },
      spinner: { hidesWhenStopped: false, ...SIZE_SMALL_BOX },
    },
    {
      name: 'the accessibility fold rides to the spinner, onLayout stays behind',
      props: {
        testID: TEST_ID,
        accessible: true,
        accessibilityLabel: 'loading',
        onLayout: () => {},
      },
      // The gate flag, not the callback: `fabricProps` drops a function and `setEventListener`
      // writes `true` in its place (`.claude/rules/fabric-boolean-event-gates.md`).
      host: { ...CENTERED, onLayout: true },
      spinner: { accessible: true, accessibilityLabel: 'loading' },
    },
  ];

  describe.each([
    { platform: 'ios', register: registerIos, values: IOS },
    { platform: 'android', register: registerAndroid, values: ANDROID },
  ])('$platform', ({ register, values }) => {
    beforeEach(register);

    it.each(CASES)('$name', ({ props, host, spinner }) => {
      const mounted = mountTag(props);

      // The platform half is merged UNDER the case's own keys, so an explicit colour still wins —
      // the same precedence the fold applies.
      expect(payloadOf(mounted.spinner)).toMatchObject({
        ...platformDefaults(values),
        ...spinner,
      });
      const hostPayload = payloadOf(mounted.host);
      expect(hostPayload).toMatchObject(host);
      expect(Object.hasOwn(hostPayload, 'testID')).toBe(false);
    });
  });
});

// A null default colour means OMIT the key, not send a null — Fabric's colour parser rejects one.
function platformDefaults(
  platform: IActivityIndicatorPlatform,
): Record<string, unknown> {
  return platform.defaultColor === null
    ? { ...platform.nativeExtras }
    : { color: platform.defaultColor, ...platform.nativeExtras };
}
