// Co-located Vue-driven test for the @symbiote-native/slider Vue wrapper. The native RNCSlider
// carries no symbiote metadata — the engine DERIVES its events + tint processors from an injected
// codegen-shaped ViewConfig (the same shape the React adapter's slider.test injects, the same shape
// RN's ReactNativeViewConfigRegistry holds on a real host). We import the Slider component from '.'
// (NOT the package barrel) so the third-party native-spec side-effect (../register) never loads
// headless. Proves: the wrapper paints the raw RNCSlider leaf inside its centering View, folds
// value/disabled/limits faithfully to the library, forwards + processes the tints, and maps the
// native value/sliding events onto onValueChange / onSlidingStart / onSlidingComplete.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Slider } from '.';

const ROOT_TAG = 311;
const SLIDER_VIEW = 'RNCSlider';

const fakeColor = (value: unknown): string => `processed(${value})`;

// The codegen-shaped config the engine derives from: both value rails (bubbling), the two sliding
// rails + accessibility (direct), plain pass-through attributes, and the tint processors.
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

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

async function mountSlider(
  props: Record<string, unknown>,
  slots?: Record<string, (scope: unknown) => unknown>,
): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(Slider, props, slots) }));
  await tick();
}

// createSlider's render body has no throwing path — it's pure prop folding + descriptor
// assembly over caller input. A single Positive group; no Negative one.
describe('Vue Slider wrapper', () => {
  describe('Positive', () => {
    it('paints the raw RNCSlider leaf inside a centering wrapper View', async () => {
      // why: renderSlider (core) always wraps the native leaf in a centering symbiote-view — a
      // caller must see BOTH the wrapper and the leaf, with the leaf's own props unaffected by
      // being nested rather than mounted at the root.
      await mountSlider({ value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 });
      const props = sliderNode().props;
      expect(props.value).toBe(0.5);
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0.1);
      // The native leaf lives under a symbiote-view wrapper (RCTView), not at the root.
      expect(fabric.find(n => n.viewName === 'RCTView')).toBeDefined();
    });

    it('defaults range + limits the way the library wrapper does', async () => {
      // why: an app that only sets `value` still needs a usable 0..1 default range and unbounded
      // limits — this is the library's documented default contract, ported verbatim.
      await mountSlider({ value: 0.3 });
      const props = sliderNode().props;
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0);
      expect(props.lowerLimit).toBe(Number.MIN_SAFE_INTEGER);
      expect(props.upperLimit).toBe(Number.MAX_SAFE_INTEGER);
      expect(props.inverted).toBe(false);
      expect(props.disabled).toBe(false);
    });

    it('resolves explicit lowerLimit/upperLimit instead of the unbounded sentinels', async () => {
      // why: resolveSliderLowerLimit/UpperLimit only fall back to the sentinels when the caller
      // gave nothing — an explicit limit must reach the native node untouched.
      await mountSlider({ value: 0.5, lowerLimit: 0.2, upperLimit: 0.8 });
      const props = sliderNode().props;
      expect(props.lowerLimit).toBe(0.2);
      expect(props.upperLimit).toBe(0.8);
    });

    it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', async () => {
      await mountSlider({ value: 0 });
      expect(sliderNode().props.value).toBeUndefined();
      unmount(ROOT_TAG);
      fabric.reset();
      await mountSlider({ value: Number.NaN });
      expect(sliderNode().props.value).toBeUndefined();
    });

    it('forwards tint props and runs them through the derived processor', async () => {
      await mountSlider({
        value: 0.2,
        minimumTrackTintColor: '#ff0000',
        maximumTrackTintColor: '#00ff00',
        thumbTintColor: '#0000ff',
      });
      const props = sliderNode().props;
      expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
      expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
      expect(props.thumbTintColor).toBe('processed(#0000ff)');
    });

    it('maps both native value rails onto onValueChange(value)', async () => {
      let changed: number | undefined;
      await mountSlider({ value: 0.2, onValueChange: (value: number) => (changed = value) });
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
      expect(changed).toBe(0.7);
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
      expect(changed).toBe(0.42);
    });

    it('maps the direct sliding events onto their callbacks', async () => {
      let startedAt: number | undefined;
      let completedAt: number | undefined;
      await mountSlider({
        value: 0.2,
        onSlidingStart: (value: number) => (startedAt = value),
        onSlidingComplete: (value: number) => (completedAt = value),
      });
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', { value: 0.1 });
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
      expect(startedAt).toBe(0.1);
      expect(completedAt).toBe(0.9);
    });

    it('resolves disabled from accessibilityState when no explicit boolean', async () => {
      await mountSlider({ value: 0.2, accessibilityState: { disabled: true } });
      expect(sliderNode().props.disabled).toBe(true);
    });

    it('an explicit disabled prop wins over accessibilityState.disabled', async () => {
      // why: resolveSliderDisabled prefers an explicit boolean unconditionally — a caller who
      // sets `disabled: false` while accessibilityState still says disabled must see the slider
      // enabled, matching the library's own precedence.
      await mountSlider({ value: 0.2, disabled: false, accessibilityState: { disabled: true } });
      expect(sliderNode().props.disabled).toBe(false);
      expect(sliderNode().props.accessibilityState).toEqual({ disabled: false });
    });

    it('renders the step indicator when renderStepNumber is set', async () => {
      await mountSlider({
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.5,
        renderStepNumber: true,
      });
      const container = fabric.find(n => n.props.testID === 'StepsIndicator-Container');
      expect(container, 'a StepsIndicator container is painted').toBeDefined();
    });

    it('renders a custom #stepMarker overlay per step instead of the default indicator', async () => {
      // why: shouldRenderStepsIndicator treats a supplied #stepMarker slot the same as
      // renderStepNumber — a caller styling their own step marks must get one cell per
      // computeStepOptions() point, not the agnostic numbered default.
      await mountSlider(
        { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.5 },
        {
          stepMarker: (scope: unknown) => {
            const { index } = scope as { index: number };
            return h('symbiote-text', { testID: `custom-marker-${index}` }, String(index));
          },
        },
      );
      expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeDefined();
      expect(fabric.find(n => n.props.testID === 'custom-marker-0')).toBeDefined();
      expect(fabric.find(n => n.props.testID === 'custom-marker-2')).toBeDefined();
    });

    it('marks the step matching the current value as stepMarked in the custom overlay', async () => {
      // why: renderCustomStepsOverlay's `stepMarked` scope field is how a caller's own
      // #stepMarker slot knows which cell to highlight as active — it must track the current
      // value, not just exist per cell unconditionally.
      let markedIndex: number | undefined;
      await mountSlider(
        { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.5 },
        {
          stepMarker: (scope: unknown) => {
            const { index, stepMarked } = scope as { index: number; stepMarked: boolean };
            if (stepMarked) markedIndex = index;
            return h('symbiote-view');
          },
        },
      );
      expect(markedIndex).toBe(1);
    });

    it('goes transparent on the native thumb tint when a thumbImage AND a #stepMarker are both set', async () => {
      // why: resolveThumbTintColor's contract fires only when BOTH are present — a thumbImage
      // with no custom marker still needs its tint, and a marker with no thumbImage has no
      // native thumb to make transparent in the first place.
      await mountSlider(
        {
          value: 0.5,
          thumbTintColor: '#0000ff',
          thumbImage: { uri: 'https://example.com/thumb.png' },
        },
        { stepMarker: () => h('symbiote-view') },
      );
      // 'processed(...)' is the fake color processor from RNC_SLIDER_VIEW_CONFIG — the fold's own
      // job stops at picking 'transparent'; the value still runs through the same derived
      // processor every other tint does.
      expect(sliderNode().props.thumbTintColor).toBe('processed(transparent)');
      // why: shouldPassNativeThumbImage's other half of the same contract — the marker draws its
      // own thumb image, so the native leaf must not ALSO receive one underneath it.
      expect(sliderNode().props.thumbImage).toBeUndefined();
    });

    it('does NOT leak the JS onValueChange callback to the native node as a prop', async () => {
      await mountSlider({ value: 0.2, onValueChange: () => undefined });
      expect(typeof sliderNode().props.onValueChange).not.toBe('function');
    });

    it('accepts modelValue as an alias for value, never forwarding it to the native node', async () => {
      await mountSlider({ modelValue: 0.6 });
      const props = sliderNode().props;
      expect(props.value).toBe(0.6);
      expect('modelValue' in props, 'modelValue must not reach Fabric').toBe(false);
    });

    it('emits update:modelValue and update:value alongside valueChange', async () => {
      let modelValueUpdate: number | undefined;
      let valueUpdate: number | undefined;
      await mountSlider({
        modelValue: 0.2,
        'onUpdate:modelValue': (value: number) => (modelValueUpdate = value),
        'onUpdate:value': (value: number) => (valueUpdate = value),
      });
      fabric.fireEvent(sliderNode().instanceHandle, 'topChange', { value: 0.7 });
      expect(modelValueUpdate).toBe(0.7);
      expect(valueUpdate).toBe(0.7);
    });
  });
});
