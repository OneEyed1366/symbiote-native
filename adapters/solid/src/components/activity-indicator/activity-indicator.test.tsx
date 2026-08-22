// Solid twin of adapters/react/src/components/activity-indicator/activity-indicator.test.tsx.
// Drives REAL compiled Solid JSX (the vitest `solid` project runs the same babel-preset-solid
// options the app-facing babel-preset.cjs pins) through the universal renderer into the fake Fabric
// slot.
//
// Coverage scope: the SOLID-SIDE half per <components_split_logic_view_lifecycle> — prop
// resolution (createActivityIndicator in shared.ts), platform wiring (index.ios.ts /
// index.android.ts), and the descriptor -> Solid bridge. The pure render fn it drives
// (renderActivityIndicator) has no dedicated core/components test, so its branches are exercised
// here rather than duplicated — the same arrangement the React file documents.
//
// The last case has no counterpart in the React file and exists because Solid's lifecycle is the
// one thing NOT shared with it: a component body runs ONCE, so "a prop change after mount still
// reaches native, on the same node" is a real, silently-breakable claim here, not a tautology.
//
// No Negative group: neither createActivityIndicator nor renderActivityIndicator has a guard clause
// or a throw — every prop is passed through or defaulted, there is no input the component rejects.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { ActivityIndicator as ActivityIndicatorIOS } from './index';
import { ActivityIndicator as ActivityIndicatorAndroid } from './index.android';

const ROOT_TAG = 813;
// The map in core/components/src/component-names resolves to the iOS build headless, so BOTH
// platform describes below find their spinner under the iOS view name; what differs per platform is
// the prop bag, which is exactly what the Android cases assert.
const SPINNER_VIEW = 'ActivityIndicatorView';
const SIZE_SMALL_PX = 20;
const SIZE_LARGE_PX = 36;
const NUMERIC_SIZE_PX = 48;
const IOS_DEFAULT_COLOR = '#999999';

// installFabric() installs ONE shared globalThis slot for the whole suite — a second call mid-file
// would orphan the first handle while global commits keep landing on the newer slot.
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// A created node's props are frozen at first commit (clone-on-write hands back a new object), so
// anything asserted after an update must be read off the live committed tree.
function committed(predicate: (node: IFakeNode) => boolean): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (predicate(node)) found = node;
  });
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

function spinner(): IFakeNode {
  return committed(node => node.viewName === SPINNER_VIEW);
}

// Skip the engine's synthetic box-none root; the centering wrapper is ActivityIndicator's own
// RCTView.
function wrapper(): IFakeNode {
  return committed(
    node =>
      node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
  );
}

function createdSpinner(): IFakeNode {
  const node = fabric.find(n => n.viewName === SPINNER_VIEW);
  if (node === undefined) throw new Error(`no ${SPINNER_VIEW} was created`);
  return node;
}

describe('Solid ActivityIndicator on the engine (iOS platform build, index.ios.ts)', () => {
  describe('Positive', () => {
    // why: RN's 'small'/'large' sizes are JS-side translations — the native spinner gets BOTH a size
    // enum AND a fixed style box, so a wrong branch paints a plausible spinner at the wrong size
    // rather than erroring.
    it('maps size="small" to the native size enum and a fixed 20x20 box', async () => {
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS size="small" animating={true} />
      ));
      await tick();

      const props = spinner().props;
      expect(props.size).toBe('small');
      expect(props.width).toBe(SIZE_SMALL_PX);
      expect(props.height).toBe(SIZE_SMALL_PX);
    });

    // why: the centering wrapper (alignItems/justifyContent: center) is what keeps the spinner
    // visually centered regardless of its box size — a product requirement, not an accident of the
    // native view's own layout. The tree shape pins that the spinner is a CHILD of that wrapper.
    it('maps size="large" to a 36x36 box inside a centering wrapper', async () => {
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS size="large" color="#0000ff" animating={false} />
      ));
      await tick();

      expect(fabric.serialize(fabric.appRoot().children)).toBe(
        'RCTView(ActivityIndicatorView)',
      );

      const props = spinner().props;
      expect(props.animating).toBe(false);
      expect(props.color).toBe('#0000ff');
      expect(props.size).toBe('large');
      expect(props.width).toBe(SIZE_LARGE_PX);
      expect(props.height).toBe(SIZE_LARGE_PX);

      expect(wrapper().props.alignItems).toBe('center');
      expect(wrapper().props.justifyContent).toBe('center');
    });

    // why: a numeric size has no native enum counterpart — RN sizes it purely through style, so the
    // native `size` prop must be ABSENT, not some coerced value Fabric would reject.
    it('sizes a numeric size via style only, emitting no native size prop', async () => {
      mount(ROOT_TAG, () => <ActivityIndicatorIOS size={NUMERIC_SIZE_PX} />);
      await tick();

      const props = spinner().props;
      expect('size' in props).toBe(false);
      expect(props.width).toBe(NUMERIC_SIZE_PX);
      expect(props.height).toBe(NUMERIC_SIZE_PX);
    });

    // why: matches RN's ActivityIndicator.js iOS branch — the spinner animates out of the box, and
    // iOS supplies a fixed GRAY default rather than leaving color unset. Solid has no destructuring
    // defaults to lean on, so these are hand-written `??` folds that can silently drift.
    it('defaults animating, hidesWhenStopped and the iOS color when all are omitted', async () => {
      mount(ROOT_TAG, () => <ActivityIndicatorIOS />);
      await tick();

      const props = spinner().props;
      expect(props.animating).toBe(true);
      expect(props.hidesWhenStopped).toBe(true);
      expect(props.color).toBe(IOS_DEFAULT_COLOR);
    });

    // why: `style` is the one caller prop that must reach the WRAPPER rather than the spinner, and
    // it must land AFTER the centering box so a caller can override it — the spinner's own style is
    // the fixed size box and nothing of the caller's may leak into it.
    it('merges the caller style over the centering box, leaving the spinner box alone', async () => {
      const MARGIN = 12;
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS
          size="large"
          style={{ margin: MARGIN, alignItems: 'flex-start' }}
        />
      ));
      await tick();

      const wrapperProps = wrapper().props;
      expect(wrapperProps.margin).toBe(MARGIN);
      expect(wrapperProps.alignItems).toBe('flex-start');
      expect(wrapperProps.justifyContent).toBe('center');

      const spinnerProps = spinner().props;
      expect('margin' in spinnerProps).toBe(false);
      expect(spinnerProps.width).toBe(SIZE_LARGE_PX);
    });

    // why: the spinner's own props (animating / size / color / hidesWhenStopped) belong to the
    // native spinner alone — leaking them onto the wrapper RCTView sends Fabric props its
    // ViewManager has never heard of. `style` is the deliberate exception: the wrapper takes the
    // caller's style merged over the centering box, while the spinner takes only its size box.
    it('keeps the spinner-only props off the wrapper', async () => {
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS size="large" color="#0000ff" animating={true} />
      ));
      await tick();

      const props = wrapper().props;
      expect('animating' in props).toBe(false);
      expect('size' in props).toBe(false);
      expect('color' in props).toBe(false);
      expect('hidesWhenStopped' in props).toBe(false);
    });

    // why: hidesWhenStopped defaults true (a stopped spinner vanishes, matching RN); callers that
    // want a stopped spinner to stay visible must be able to opt out, which only works if the
    // default is a fallback rather than a coercion.
    it('lets an explicit hidesWhenStopped override its true default', async () => {
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS animating={false} hidesWhenStopped={false} />
      ));
      await tick();

      expect(spinner().props.hidesWhenStopped).toBe(false);
    });

    // why: RN spreads `...props` onto the centering View, so testID/accessibility/onLayout must land
    // on the WRAPPER, not the native spinner — the spinner is an implementation detail a test or
    // automation script should never need to reach into.
    it('forwards testID and accessibility props to the wrapper, and routes onLayout', async () => {
      const TEST_ID = 'spinner-wrapper';
      const ACCESSIBILITY_LABEL = 'loading';
      let layoutFired = false;

      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS
          testID={TEST_ID}
          accessibilityLabel={ACCESSIBILITY_LABEL}
          accessible={true}
          onLayout={() => {
            layoutFired = true;
          }}
        />
      ));
      await tick();

      const props = wrapper().props;
      expect(props.testID).toBe(TEST_ID);
      expect(props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
      expect(props.accessible).toBe(true);

      // onLayout is a BASE event in the engine's ViewConfig: firing topLayout calls the handler. The
      // created wrapper carries the instanceHandle the event dispatcher keys on.
      const createdWrapper = fabric.find(
        n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
      );
      if (createdWrapper === undefined)
        throw new Error('no RCTView wrapper was created');
      fabric.fireEvent(createdWrapper.instanceHandle, 'topLayout', {});
      expect(layoutFired).toBe(true);
    });

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit
    // (RN's own View.js transform). The wrapper is a raw symbiote-view emitted by the render fn, not
    // the View component, so nothing else in the path performs that fold — dropping it would let
    // `aria-label` ride to Fabric as a meaningless prop and leave the spinner unlabelled.
    it('folds aria aliases into the canonical accessibility props on the wrapper', async () => {
      mount(ROOT_TAG, () => (
        <ActivityIndicatorIOS aria-label="loading" aria-busy={true} />
      ));
      await tick();

      const props = wrapper().props;
      expect(props.accessibilityLabel).toBe('loading');
      expect(props.accessibilityState).toEqual({ busy: true });
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the descriptor accessor
    // precisely so a later change still reaches the host node; a single destructure in shared.ts
    // would freeze the spinner at its mount-time props while every other test in this file passed.
    // The node-identity assertion is the other half: rebuilding the tree instead of re-propping it
    // would also show the new value, while destroying the identity native state keys on.
    it('re-commits the same native nodes when a prop changes after mount', async () => {
      const [animating, setAnimating] = createSignal(true);
      mount(ROOT_TAG, () => <ActivityIndicatorIOS animating={animating()} />);
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(spinner().props.animating).toBe(true);

      setAnimating(false);
      await tick();

      expect(spinner().props.animating).toBe(false);
      expect(
        fabric.counts.createNode,
        'the host nodes kept their identity',
      ).toBe(createdAtMount);
      expect(createdSpinner().viewName).toBe(SPINNER_VIEW);
    });
  });
});

describe('Solid ActivityIndicator on the engine (Android platform build, index.android.ts)', () => {
  describe('Positive', () => {
    // why: AndroidProgressBar crashes with "setStyle() not called" unless styleAttr is set, and
    // needs indeterminate:true for the spinning (non-progress-tracking) variant. Unlike iOS, Android
    // has no fixed default color — RN lets the theme supply it — and an explicit `null` color would
    // be rejected by Fabric's color parser, so the prop must be OMITTED entirely.
    it('supplies styleAttr + indeterminate and omits color so the theme colors it', async () => {
      mount(ROOT_TAG, () => <ActivityIndicatorAndroid animating={true} />);
      await tick();

      const props = spinner().props;
      expect(props.styleAttr).toBe('Normal');
      expect(props.indeterminate).toBe(true);
      expect('color' in props).toBe(false);
    });

    // why: the theme default only applies when the caller doesn't opt in to a color — an explicit
    // color must win, the same contract as iOS.
    it('still honors an explicitly given color over the theme default', async () => {
      mount(ROOT_TAG, () => <ActivityIndicatorAndroid color="#ff0000" />);
      await tick();

      expect(spinner().props.color).toBe('#ff0000');
    });
  });
});
