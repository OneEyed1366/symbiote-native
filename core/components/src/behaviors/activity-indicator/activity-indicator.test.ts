// ActivityIndicator's host behavior — the COMPOSITION half, which is all that is left in JS.
//
// WHAT THIS PROVES: the engine builds, from the tag alone, the two-node tree RN itself renders
// (`ActivityIndicator.js:112`), routes the app's props across RN's own split, and seeds the native
// props AndroidProgressBar requires. None of that is a prop rewrite; all of it is structure.
//
// WHAT LEFT THIS FILE on 2026-09-18, and it was most of it. The size translation, the two `!== false`
// defaults, the centering style and the platform colour are `foldActivityIndicatorProps` /
// `foldActivityIndicatorSpinnerProps` in `SymbioteFabricProps.cpp` now, asserted against the payload
// the commit actually sent in `core/engine/cpp/tests/js/activity-indicator-payload.itest.ts`. This
// harness builds its payloads through the TypeScript `fabricProps`, which carries no copy of the tag
// rules and must not grow one.
//
// THEY MOVED AS A GROUP, INCLUDING THE CASES THAT WERE STILL GREEN, and that is the part worth
// reading before adding anything back. "OMITS colour entirely on the theme default" passed after the
// port — for the wrong reason: the key is absent because no rule ran at all, not because Android's
// half omitted it. So did "an explicit colour wins over the default", which cannot tell a rule that
// prefers the app's value from a rule that does not exist. An absence assertion left on a harness
// that can no longer produce the key passes forever and means nothing, so every case whose subject
// was a fold went with its twin rather than the failing ones alone.
//
// PLATFORM ARMS ARE BY FILE, not by a `Platform.OS` mock, because the behavior's platform half is a
// folder-as-module split. The intrinsic->native-name table still resolves to the iOS build under
// vitest, so the Android arm's spinner serializes as `ActivityIndicatorView`; nothing below keys off
// that name — the Android claim here is about the two native extras.
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

afterEach(() => {
  clearHostBehaviors();
  clearGlobalStyles();
  fabric.reset();
});

// One node, the props written on it exactly as an app writes them on the tag. Nothing here names
// the spinner — that is the behavior's job, and its absence is the test.
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

// The native extras are NOT a fold and that is why they are still here: `buildStructure` writes them
// with `setProp` at build time, as constants of the platform, the way ScrollView seeds
// `collapsable: false`. They are props on the node before any payload is built, so this harness sees
// them whether or not it carries the tag rules.
describe('the platform half that is still structure, not a rule', () => {
  it('sends no native extras on iOS — those are AndroidProgressBar requirements', () => {
    registerIos();
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(Object.hasOwn(payload, 'styleAttr')).toBe(false);
    expect(Object.hasOwn(payload, 'indeterminate')).toBe(false);
  });

  it('sends styleAttr and indeterminate on Android, without which the view throws setStyle()', () => {
    registerAndroid();
    const payload = payloadOf(mountTag({ testID: TEST_ID }).spinner);

    expect(payload.styleAttr).toBe('Normal');
    expect(payload.indeterminate).toBe(true);
  });
});
