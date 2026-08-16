// Co-located React-driven test for the @symbiote-native/slider React wrapper. Mirrors the Vue
// wrapper test against the SAME injected codegen-shaped ViewConfig, proving the shared core drives
// React identically: the native RNCSlider leaf paints inside the centering View, value/disabled/
// limits fold faithfully to the library, tints process, and the native value/sliding events map
// onto onValueChange / onSlidingStart / onSlidingComplete. Slider is imported from '.' (NOT the
// package barrel) so the third-party native-spec side-effect (../register) never loads headless.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Slider } from '.';

const ROOT_TAG = 312;
const SLIDER_VIEW = 'RNCSlider';

const fakeColor = (value: unknown): string => `processed(${value})`;

const RNC_SLIDER_VIEW_CONFIG = {
  bubblingEventTypes: {
    topChange: { phasedRegistrationNames: { bubbled: 'onChange', captured: 'onChangeCapture' } },
    topRNCSliderValueChange: {
      phasedRegistrationNames: {
        bubbled: 'onRNCSliderValueChange',
        captured: 'onRNCSliderValueChangeCapture',
      },
    },
  },
  directEventTypes: {
    topRNCSliderSlidingStart: { registrationName: 'onRNCSliderSlidingStart' },
    topRNCSliderSlidingComplete: { registrationName: 'onRNCSliderSlidingComplete' },
    topRNCSliderAccessibilityAction: { registrationName: 'onRNCSliderAccessibilityAction' },
  },
  validAttributes: {
    value: true,
    minimumValue: true,
    maximumValue: true,
    step: true,
    lowerLimit: true,
    upperLimit: true,
    inverted: true,
    disabled: true,
    minimumTrackTintColor: { process: fakeColor },
    maximumTrackTintColor: { process: fakeColor },
    thumbTintColor: { process: fakeColor },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => (name === SLIDER_VIEW ? RNC_SLIDER_VIEW_CONFIG : undefined));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findInTree(predicate, node.children);
    if (child) return child;
  }
  return undefined;
}

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

function currentSliderNode(): IFakeNode {
  const node = findInTree(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no committed ${SLIDER_VIEW} exists`);
  return node;
}

function sliderWrapperNode(): IFakeNode {
  const node = findInTree(
    n => n.viewName === 'RCTView' && n.children.some(child => child.viewName === SLIDER_VIEW),
  );
  if (!node) throw new Error('no committed Slider wrapper exists');
  return node;
}

// createSlider's render body has no throwing path — it's pure prop folding + descriptor
// assembly over caller input. A single Positive group; no Negative one.
describe('React Slider wrapper', () => {
  describe('Positive', () => {
    it('paints the raw RNCSlider leaf inside a centering wrapper View', () => {
      // why: renderSlider (core) always wraps the native leaf in a centering symbiote-view — a
      // caller must see BOTH the wrapper and the leaf, with the leaf's own props unaffected by
      // being nested rather than mounted at the root.
      mount(
        ROOT_TAG,
        createElement(Slider, { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 }),
      );
      const props = sliderNode().props;
      expect(props.value).toBe(0.5);
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0.1);
      expect(fabric.find(n => n.viewName === 'RCTView')).toBeDefined();
    });

    it('defaults range + limits the way the library wrapper does', () => {
      // why: an app that only sets `value` still needs a usable 0..1 default range and unbounded
      // limits — this is the library's documented default contract, ported verbatim.
      mount(ROOT_TAG, createElement(Slider, { value: 0.3 }));
      const props = sliderNode().props;
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0);
      expect(props.lowerLimit).toBe(Number.MIN_SAFE_INTEGER);
      expect(props.upperLimit).toBe(Number.MAX_SAFE_INTEGER);
      expect(props.inverted).toBe(false);
      expect(props.disabled).toBe(false);
    });

    it('resolves explicit lowerLimit/upperLimit instead of the unbounded sentinels', () => {
      // why: resolveSliderLowerLimit/UpperLimit only fall back to the sentinels when the caller
      // gave nothing — an explicit limit must reach the native node untouched, not get
      // overwritten by the default.
      mount(ROOT_TAG, createElement(Slider, { value: 0.5, lowerLimit: 0.2, upperLimit: 0.8 }));
      const props = sliderNode().props;
      expect(props.lowerLimit).toBe(0.2);
      expect(props.upperLimit).toBe(0.8);
    });

    it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', () => {
      mount(ROOT_TAG, createElement(Slider, { value: 0 }));
      expect(sliderNode().props.value).toBeUndefined();
      unmount(ROOT_TAG);
      fabric.reset();
      mount(ROOT_TAG, createElement(Slider, { value: Number.NaN }));
      expect(sliderNode().props.value).toBeUndefined();
    });

    it('measures the wrapper and pins the native slider width in the common non-steps path', async () => {
      // why: the wrapper's onLayout is the only source of `width` — without it the native slider
      // would size naturally rather than sharing a coordinate space with a future step overlay.
      mount(ROOT_TAG, createElement(Slider, { value: 0.5 }));
      fabric.fireEvent(sliderWrapperNode().instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: 240, height: 40 },
      });
      await tick();
      expect(currentSliderNode().props.width).toBe(240);
    });

    it('forwards tint props and runs them through the derived processor', () => {
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.2,
          minimumTrackTintColor: '#ff0000',
          maximumTrackTintColor: '#00ff00',
          thumbTintColor: '#0000ff',
        }),
      );
      const props = sliderNode().props;
      expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
      expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
      expect(props.thumbTintColor).toBe('processed(#0000ff)');
    });

    it('maps both native value rails onto onValueChange(value)', () => {
      let changed: number | undefined;
      mount(
        ROOT_TAG,
        createElement(Slider, { value: 0.2, onValueChange: (v: number) => (changed = v) }),
      );
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
      expect(changed).toBe(0.7);
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
      expect(changed).toBe(0.42);
    });

    it('maps the direct sliding events onto their callbacks', () => {
      let startedAt: number | undefined;
      let completedAt: number | undefined;
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.2,
          onSlidingStart: (v: number) => (startedAt = v),
          onSlidingComplete: (v: number) => (completedAt = v),
        }),
      );
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', { value: 0.1 });
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
      expect(startedAt).toBe(0.1);
      expect(completedAt).toBe(0.9);
    });

    it('resolves disabled from accessibilityState when no explicit boolean', () => {
      mount(
        ROOT_TAG,
        createElement(Slider, { value: 0.2, accessibilityState: { disabled: true } }),
      );
      expect(sliderNode().props.disabled).toBe(true);
    });

    it('an explicit disabled prop wins over accessibilityState.disabled', () => {
      // why: resolveSliderDisabled prefers an explicit boolean unconditionally — a caller who
      // sets `disabled={false}` while accessibilityState still says disabled must see the slider
      // enabled, matching the library's own precedence.
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.2,
          disabled: false,
          accessibilityState: { disabled: true },
        }),
      );
      expect(sliderNode().props.disabled).toBe(false);
      expect(sliderNode().props.accessibilityState).toEqual({ disabled: false });
    });

    it('renders the step indicator when renderStepNumber is set', () => {
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.5,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.5,
          renderStepNumber: true,
        }),
      );
      expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeDefined();
    });

    it('renders a custom StepMarker overlay per step instead of the default indicator', () => {
      // why: shouldRenderStepsIndicator treats a supplied StepMarker the same as
      // renderStepNumber — a caller styling their own step marks must get one cell per
      // computeStepOptions() point, not the agnostic numbered default.
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.5,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.5,
          StepMarker: ({ index }: { index: number }) =>
            createElement('symbiote-text', { testID: `custom-marker-${index}` }, String(index)),
        }),
      );
      expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeDefined();
      expect(fabric.find(n => n.props.testID === 'custom-marker-0')).toBeDefined();
      expect(fabric.find(n => n.props.testID === 'custom-marker-2')).toBeDefined();
    });

    it('marks the step matching the current value as stepMarked in the custom overlay', () => {
      // why: renderCustomStepsOverlay's `stepMarked` flag is how a caller's own StepMarker knows
      // which cell to highlight as active — it must track the reported/current value, not just
      // exist per cell unconditionally.
      let markedIndex: number | undefined;
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.5,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.5,
          StepMarker: ({ index, stepMarked }: { index: number; stepMarked: boolean }) => {
            if (stepMarked) markedIndex = index;
            return createElement('symbiote-view');
          },
        }),
      );
      expect(markedIndex).toBe(1);
    });

    it('goes transparent on the native thumb tint when a thumbImage AND a StepMarker are both set', () => {
      // why: resolveThumbTintColor's contract fires only when BOTH are present — a thumbImage
      // with no custom marker still needs its tint (there's nothing else drawing over it), and a
      // StepMarker with no thumbImage has no native thumb to make transparent in the first place.
      mount(
        ROOT_TAG,
        createElement(Slider, {
          value: 0.5,
          thumbTintColor: '#0000ff',
          thumbImage: { uri: 'https://example.com/thumb.png' },
          StepMarker: () => createElement('symbiote-view'),
        }),
      );
      // 'processed(...)' is the fake color processor from RNC_SLIDER_VIEW_CONFIG — the fold's own
      // job stops at picking 'transparent'; the value still runs through the same derived
      // processor every other tint does.
      expect(sliderNode().props.thumbTintColor).toBe('processed(transparent)');
      // why: shouldPassNativeThumbImage's other half of the same contract — the marker draws its
      // own thumb image, so the native leaf must not ALSO receive one underneath it.
      expect(sliderNode().props.thumbImage).toBeUndefined();
    });

    it('does NOT leak the JS onValueChange callback to the native node as a prop', () => {
      mount(ROOT_TAG, createElement(Slider, { value: 0.2, onValueChange: () => undefined }));
      expect(typeof sliderNode().props.onValueChange).not.toBe('function');
    });
  });
});
