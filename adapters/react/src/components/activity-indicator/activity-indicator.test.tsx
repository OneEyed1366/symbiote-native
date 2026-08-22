// Coverage scope: this file owns the REACT-SIDE half of ActivityIndicator per
// <components_split_logic_view_lifecycle> — prop resolution (useActivityIndicatorLogic in
// shared.ts), platform wiring (index.ios.ts / index.android.ts), and the descriptor->React
// bridge. The pure render fn it drives (renderActivityIndicator, core/components/src/view/
// render-activity-indicator.ts: size->native-enum translation, color omission, wrapper shape)
// has NO dedicated core/components test yet, so its branches are exercised here rather than
// duplicated — that is a gap in core coverage, not something this file should paper over by
// skipping the branch. resolveAccessibilityProps' own branch logic is intentionally NOT
// exhaustively re-tested here (it is a shared, generic accessibility resolver reused by every
// View-like component); only the wiring — that ActivityIndicator forwards accessibility props
// to the wrapper at all — is asserted.
//
// No Negative group: neither useActivityIndicatorLogic nor renderActivityIndicator has a guard
// clause or a throw. Every prop is either passed through or defaulted; there is no invalid input
// the component rejects.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  ActivityIndicator as ActivityIndicatorIOS,
} from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { ActivityIndicator as ActivityIndicatorAndroid } from './index.android';

const ROOT_TAG = 21;

// installFabric() installs ONE shared globalThis slot for the whole suite — a second call
// mid-file would silently orphan the first handle's closure while global commits keep landing
// on the newer slot, so both describes below share this single instance.
const fabric = installFabric();

function findSpinner(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ActivityIndicatorView');
  if (!node) throw new Error('no ActivityIndicatorView was created');
  return node;
}

function findWrapper(): IFakeNode {
  // Skip the synthetic AppContainer root (RCTView, box-none); the centering wrapper is
  // ActivityIndicator's own RCTView.
  const node = fabric.find(
    n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  );
  if (!node) throw new Error('no RCTView wrapper was created');
  return node;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('ActivityIndicator (iOS platform build, index.ios.ts)', () => {
  describe('Positive', () => {
    it('maps size="small" to the native size enum and a fixed 20x20 box', () => {
      // why: RN's 'small'/'large' sizes are JS-side translations — the native spinner gets
      // BOTH a size enum AND a fixed style box, so the two named sizes must render identically
      // whichever branch resolveSize takes. Only 'large' and numeric were exercised before;
      // 'small' shares the same branch shape and must be proven independently.
      function App(): ReactElement {
        return <ActivityIndicatorIOS size="small" animating={true} />;
      }
      mount(ROOT_TAG, <App />);

      const spinner = findSpinner();
      expect(spinner.props.size).toBe('small');
      expect(spinner.props.width).toBe(20);
      expect(spinner.props.height).toBe(20);
    });

    it('maps size="large" to the native size enum and a fixed 36x36 box, with wrapper centering', () => {
      // why: the centering wrapper (alignItems/justifyContent: center) is what keeps the
      // spinner visually centered regardless of its box size — a product requirement, not an
      // accident of the native view's own layout.
      function App(): ReactElement {
        return (
          <ActivityIndicatorIOS
            size="large"
            color="#0000ff"
            animating={false}
          />
        );
      }
      mount(ROOT_TAG, <App />);

      expect(fabric.serialize(fabric.appRoot().children)).toBe(
        'RCTView(ActivityIndicatorView)',
      );

      const spinner = findSpinner();
      expect(spinner.props.animating).toBe(false);
      expect(spinner.props.color).toBe('#0000ff');
      expect(spinner.props.size).toBe('large');
      expect(spinner.props.width).toBe(36);
      expect(spinner.props.height).toBe(36);

      const wrapper = findWrapper();
      expect(wrapper.props.alignItems).toBe('center');
      expect(wrapper.props.justifyContent).toBe('center');
    });

    it('sizes a numeric size via style only, emitting no native size prop', () => {
      // why: a numeric size has no native enum counterpart — RN sizes it purely through style,
      // so the native `size` prop must be ABSENT, not set to some coerced value that Fabric
      // would reject.
      function App(): ReactElement {
        return <ActivityIndicatorIOS size={48} />;
      }
      mount(ROOT_TAG, <App />);

      const spinner = findSpinner();
      expect('size' in spinner.props).toBe(false);
      expect(spinner.props.width).toBe(48);
      expect(spinner.props.height).toBe(48);
    });

    it('defaults animating to true and color to the iOS platform default when both are omitted', () => {
      // why: matches RN's ActivityIndicator.js iOS branch — the spinner animates out of the
      // box, and iOS supplies a fixed GRAY default rather than leaving color unset.
      function App(): ReactElement {
        return <ActivityIndicatorIOS />;
      }
      mount(ROOT_TAG, <App />);

      const spinner = findSpinner();
      expect(spinner.props.animating).toBe(true);
      expect(spinner.props.color).toBe('#999999');
    });

    it('lets an explicit hidesWhenStopped override its true default', () => {
      // why: hidesWhenStopped defaults true (spinner vanishes once stopped, matching RN);
      // callers that want a static/stopped spinner to stay visible must be able to opt out.
      function App(): ReactElement {
        return (
          <ActivityIndicatorIOS animating={false} hidesWhenStopped={false} />
        );
      }
      mount(ROOT_TAG, <App />);

      expect(findSpinner().props.hidesWhenStopped).toBe(false);
    });

    it('forwards standard ViewProps to the wrapper and routes onLayout as a real topLayout event', () => {
      // why: RN spreads `...props` onto the centering View, so testID/accessibility/onLayout
      // must land on the WRAPPER, not the native spinner — the spinner is an implementation
      // detail a test/automation script should never need to reach into.
      const TEST_ID = 'spinner-wrapper';
      const ACCESSIBILITY_LABEL = 'loading';
      let layoutFired = false;

      function App(): ReactElement {
        return (
          <ActivityIndicatorIOS
            testID={TEST_ID}
            accessibilityLabel={ACCESSIBILITY_LABEL}
            accessible={true}
            onLayout={() => {
              layoutFired = true;
            }}
          />
        );
      }
      mount(ROOT_TAG, <App />);

      const wrapper = findWrapper();
      expect(wrapper.props.testID).toBe(TEST_ID);
      expect(wrapper.props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
      expect(wrapper.props.accessible).toBe(true);

      // onLayout is a BASE event in the engine's ViewConfig: firing topLayout calls the handler.
      fabric.fireEvent(wrapper.instanceHandle, 'topLayout', {});
      expect(layoutFired).toBe(true);
    });
  });
});

describe('ActivityIndicator (Android platform build, index.android.ts)', () => {
  describe('Positive', () => {
    it('supplies styleAttr + indeterminate native extras and omits color so the theme colors it', () => {
      // why: AndroidProgressBar crashes with "setStyle() not called" unless styleAttr is set,
      // and needs indeterminate:true for the spinning (non-progress-tracking) variant. Unlike
      // iOS, Android has no fixed default color — RN lets the theme supply it — and passing an
      // explicit `null` color would be rejected by Fabric's color parser, so the platform must
      // OMIT the prop entirely rather than default it to some sentinel value.
      function App(): ReactElement {
        return <ActivityIndicatorAndroid animating={true} />;
      }
      mount(ROOT_TAG, <App />);

      const spinner = findSpinner();
      expect(spinner.props.styleAttr).toBe('Normal');
      expect(spinner.props.indeterminate).toBe(true);
      expect('color' in spinner.props).toBe(false);
    });

    it('still honors an explicitly given color over the theme default', () => {
      // why: Android's theme default only applies when the caller doesn't opt in to a color —
      // an explicit color must win, same contract as iOS.
      function App(): ReactElement {
        return <ActivityIndicatorAndroid color="#ff0000" />;
      }
      mount(ROOT_TAG, <App />);

      expect(findSpinner().props.color).toBe('#ff0000');
    });
  });
});
