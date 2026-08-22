// Co-located Solid-driven test for the @symbiote-native/slider Solid wrapper. Drives REAL compiled
// Solid JSX (the vitest `solid` project runs the same babel-preset-solid options the app-facing
// preset pins) through the universal renderer into the fake Fabric slot, against the SAME injected
// codegen-shaped ViewConfig the React and Vue slider tests use — so the shared core is proven to
// drive Solid identically: the native RNCSlider leaf paints inside the centering View, value/
// disabled/limits fold faithfully to the library, tints process, and the native value/sliding
// events map onto onValueChange / onSlidingStart / onSlidingComplete. Slider is imported from '.'
// (NOT the package barrel) so the third-party native-spec side-effect (../register) never loads.
//
// The last three cases have no counterpart in the React file and are the ones a naive port ships
// broken, because Solid's lifecycle is the half NOT shared with it: a component body runs once and
// `insert` REPLACES rather than diffs, so "the value reaches the SAME native node", "a value report
// does not re-invoke the step markers" and "the aria fold happens before the handled props are
// read" are real, silently-breakable claims here rather than tautologies.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Slider } from '.';

const ROOT_TAG = 313;
const SLIDER_VIEW = 'RNCSlider';

const fakeColor = (value: unknown): string => `processed(${value})`;

// The codegen-shaped config the engine derives from: both value rails (bubbling), the two sliding
// rails + accessibility (direct), plain pass-through attributes, and the tint processors.
const RNC_SLIDER_VIEW_CONFIG = {
  bubblingEventTypes: {
    topChange: {
      phasedRegistrationNames: {
        bubbled: 'onChange',
        captured: 'onChangeCapture',
      },
    },
    topRNCSliderValueChange: {
      phasedRegistrationNames: {
        bubbled: 'onRNCSliderValueChange',
        captured: 'onRNCSliderValueChangeCapture',
      },
    },
  },
  directEventTypes: {
    topRNCSliderSlidingStart: { registrationName: 'onRNCSliderSlidingStart' },
    topRNCSliderSlidingComplete: {
      registrationName: 'onRNCSliderSlidingComplete',
    },
    topRNCSliderAccessibilityAction: {
      registrationName: 'onRNCSliderAccessibilityAction',
    },
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
setNativeViewConfigSource(name =>
  name === SLIDER_VIEW ? RNC_SLIDER_VIEW_CONFIG : undefined,
);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

// The created node's props are frozen at first commit (clone-on-write hands back a new object), so
// anything asserted after an update is read off the live committed tree instead.
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
    n =>
      n.viewName === 'RCTView' &&
      n.children.some(child => child.viewName === SLIDER_VIEW),
  );
  if (!node) throw new Error('no committed Slider wrapper exists');
  return node;
}

// The wrapper is assembled from pure prop folding + descriptor assembly over caller input; there is
// no throwing path. A single Positive group, matching the React file; no Negative one.
describe('Solid Slider wrapper', () => {
  describe('Positive', () => {
    it('paints the raw RNCSlider leaf inside a centering wrapper View', async () => {
      // why: the wrapper is what carries the caller's style + the layout measurement — a caller must
      // see BOTH it and the leaf, with the leaf's own props unaffected by being nested.
      mount(ROOT_TAG, () => (
        <Slider value={0.5} minimumValue={0} maximumValue={1} step={0.1} />
      ));
      await tick();
      const props = sliderNode().props;
      expect(props.value).toBe(0.5);
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0.1);
      expect(sliderWrapperNode()).toBeDefined();
    });

    it('defaults range + limits the way the library wrapper does', async () => {
      // why: an app that only sets `value` still needs a usable 0..1 default range and unbounded
      // limits — the library's documented default contract, ported verbatim.
      mount(ROOT_TAG, () => <Slider value={0.3} />);
      await tick();
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
      // why: the sentinels are a FALLBACK — an explicit limit must reach native untouched.
      mount(ROOT_TAG, () => (
        <Slider value={0.5} lowerLimit={0.2} upperLimit={0.8} />
      ));
      await tick();
      const props = sliderNode().props;
      expect(props.lowerLimit).toBe(0.2);
      expect(props.upperLimit).toBe(0.8);
    });

    it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', async () => {
      mount(ROOT_TAG, () => <Slider value={0} />);
      await tick();
      expect(sliderNode().props.value).toBeUndefined();
      unmount(ROOT_TAG);
      fabric.reset();
      mount(ROOT_TAG, () => <Slider value={Number.NaN} />);
      await tick();
      expect(sliderNode().props.value).toBeUndefined();
    });

    it('measures the wrapper and pins the native slider width', async () => {
      // why: the wrapper's onLayout is the only source of `width` — without it the native slider
      // would size naturally rather than sharing a coordinate space with the step overlay.
      mount(ROOT_TAG, () => <Slider value={0.5} />);
      await tick();
      fabric.fireEvent(sliderWrapperNode().instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: 240, height: 40 },
      });
      await tick();
      expect(currentSliderNode().props.width).toBe(240);
    });

    it('forwards tint props and runs them through the derived processor', async () => {
      mount(ROOT_TAG, () => (
        <Slider
          value={0.2}
          minimumTrackTintColor="#ff0000"
          maximumTrackTintColor="#00ff00"
          thumbTintColor="#0000ff"
        />
      ));
      await tick();
      const props = sliderNode().props;
      expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
      expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
      expect(props.thumbTintColor).toBe('processed(#0000ff)');
    });

    it('maps both native value rails onto onValueChange(value)', async () => {
      let changed: number | undefined;
      mount(ROOT_TAG, () => (
        <Slider value={0.2} onValueChange={v => (changed = v)} />
      ));
      await tick();
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
      expect(changed).toBe(0.7);
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', {
        value: 0.42,
      });
      expect(changed).toBe(0.42);
    });

    it('maps the direct sliding events onto their callbacks', async () => {
      let startedAt: number | undefined;
      let completedAt: number | undefined;
      mount(ROOT_TAG, () => (
        <Slider
          value={0.2}
          onSlidingStart={v => (startedAt = v)}
          onSlidingComplete={v => (completedAt = v)}
        />
      ));
      await tick();
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', {
        value: 0.1,
      });
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', {
        value: 0.9,
      });
      expect(startedAt).toBe(0.1);
      expect(completedAt).toBe(0.9);
    });

    it('maps the direct accessibility-action event onto onAccessibilityAction', async () => {
      let actionName: unknown;
      mount(ROOT_TAG, () => (
        <Slider
          value={0.2}
          onAccessibilityAction={event =>
            (actionName = event.nativeEvent.actionName)
          }
        />
      ));
      await tick();
      fabric.fireEvent(
        sliderNode().instanceHandle,
        'topRNCSliderAccessibilityAction',
        { actionName: 'increment' },
      );
      expect(actionName).toBe('increment');
    });

    it('resolves disabled from accessibilityState when no explicit boolean', async () => {
      mount(ROOT_TAG, () => (
        <Slider value={0.2} accessibilityState={{ disabled: true }} />
      ));
      await tick();
      expect(sliderNode().props.disabled).toBe(true);
    });

    it('an explicit disabled prop wins over accessibilityState.disabled', async () => {
      // why: an explicit boolean wins unconditionally — a caller who sets `disabled={false}` while
      // accessibilityState still says disabled must see the slider enabled, matching the library.
      mount(ROOT_TAG, () => (
        <Slider
          value={0.2}
          disabled={false}
          accessibilityState={{ disabled: true }}
        />
      ));
      await tick();
      expect(sliderNode().props.disabled).toBe(false);
      expect(sliderNode().props.accessibilityState).toEqual({
        disabled: false,
      });
    });

    it('renders the step indicator when renderStepNumber is set', async () => {
      mount(ROOT_TAG, () => (
        <Slider
          value={0.5}
          minimumValue={0}
          maximumValue={1}
          step={0.5}
          renderStepNumber
        />
      ));
      await tick();
      expect(
        fabric.find(n => n.props.testID === 'StepsIndicator-Container'),
      ).toBeDefined();
      expect(fabric.find(n => n.props.testID === '1th-step')).toBeDefined();
    });

    it('renders a custom StepMarker overlay per step instead of the default indicator', async () => {
      // why: a supplied StepMarker counts the same as renderStepNumber — a caller styling their own
      // marks must get one cell per computeStepOptions() point, not the numbered default.
      mount(ROOT_TAG, () => (
        <Slider
          value={0.5}
          minimumValue={0}
          maximumValue={1}
          step={0.5}
          StepMarker={marker => (
            <symbiote-view testID={`custom-marker-${marker().index}`} />
          )}
        />
      ));
      await tick();
      expect(
        fabric.find(n => n.props.testID === 'StepsIndicator-Container'),
      ).toBeDefined();
      expect(
        fabric.find(n => n.props.testID === 'custom-marker-0'),
      ).toBeDefined();
      expect(
        fabric.find(n => n.props.testID === 'custom-marker-2'),
      ).toBeDefined();
    });

    it('marks the step matching the current value as stepMarked', async () => {
      // why: `stepMarked` is how a caller's marker knows which cell is active — it must track the
      // reported/current value, not just exist per cell unconditionally.
      let markedIndex: number | undefined;
      mount(ROOT_TAG, () => (
        <Slider
          value={0.5}
          minimumValue={0}
          maximumValue={1}
          step={0.5}
          StepMarker={marker => {
            if (marker().stepMarked) markedIndex = marker().index;
            return <symbiote-view />;
          }}
        />
      ));
      await tick();
      expect(markedIndex).toBe(1);
    });

    it('goes transparent on the native thumb tint when a thumbImage AND a StepMarker are both set', async () => {
      // why: the fold fires only when BOTH are present — a thumbImage with no marker still needs
      // its tint, and a marker with no thumbImage has no native thumb to hide.
      mount(ROOT_TAG, () => (
        <Slider
          value={0.5}
          thumbTintColor="#0000ff"
          thumbImage={{ uri: 'https://example.com/thumb.png' }}
          StepMarker={() => <symbiote-view />}
        />
      ));
      await tick();
      // 'processed(...)' is the fake processor — the fold's job stops at picking 'transparent'; the
      // value still runs through the same derived processor every other tint does.
      expect(sliderNode().props.thumbTintColor).toBe('processed(transparent)');
      // The marker draws its own thumb image, so the native leaf must not ALSO receive one.
      expect(sliderNode().props.thumbImage).toBeUndefined();
    });

    it('does NOT leak the JS onValueChange callback to the native node as a prop', async () => {
      mount(ROOT_TAG, () => (
        <Slider value={0.2} onValueChange={() => undefined} />
      ));
      await tick();
      expect(typeof sliderNode().props.onValueChange).not.toBe('function');
    });

    it('pushes a later value onto the SAME native node instead of recreating it', async () => {
      // why: Solid runs a component body ONCE and its `insert` REPLACES rather than diffs, so a
      // naive port either freezes at the mount-time value or rebuilds the subtree — and a rebuilt
      // RNCSlider is a fresh native view, dropping the thumb the user is dragging and every
      // imperative command keyed on node identity. The only headless-visible trace is the node
      // count (.claude/rules/solid-descriptor-bridge.md).
      const [value, setValue] = createSignal(0.2);
      mount(ROOT_TAG, () => <Slider value={value()} />);
      await tick();
      const createdBefore = fabric.counts.createNode;
      const handleBefore = sliderNode().instanceHandle;

      setValue(0.8);
      await tick();

      expect(currentSliderNode().props.value).toBe(0.8);
      expect(fabric.counts.createNode).toBe(createdBefore);
      expect(sliderNode().instanceHandle).toBe(handleBefore);
    });

    it('re-props the step markers through their accessor rather than re-invoking them', async () => {
      // why: the marker takes an Accessor and is called ONCE, untracked. Passing a snapshot instead
      // would read the value signal inside the cell's own `insert` effect, so every native value
      // report would tear the marker subtree down and rebuild it mid-drag — the Pressable bug
      // (.claude/rules/solid-descriptor-bridge.md §4), whose only headless trace is node churn.
      let invocations = 0;
      let latest: boolean | undefined;
      mount(ROOT_TAG, () => (
        <Slider
          value={0.5}
          minimumValue={0}
          maximumValue={1}
          step={0.5}
          StepMarker={marker => {
            invocations += 1;
            return (
              <symbiote-view
                testID={`marker-${marker().index}`}
                accessibilityLabel={((): string => {
                  latest = marker().stepMarked;
                  return marker().stepMarked ? 'on' : 'off';
                })()}
              />
            );
          }}
        />
      ));
      await tick();
      expect(invocations).toBe(3);
      const createdBefore = fabric.counts.createNode;

      fabric.fireEvent(sliderNode().instanceHandle, 'topRNCSliderValueChange', {
        value: 1,
      });
      await tick();

      expect(invocations).toBe(3);
      expect(fabric.counts.createNode).toBe(createdBefore);
      expect(latest).toBe(true);
    });

    it('folds aria aliases before the handled props are read', async () => {
      // why: aria-disabled lands in accessibilityState, and accessibilityState is a prop the
      // wrapper CONSUMES — reading it raw (post-split) instead of off the fold would hand the
      // disabled resolution an undefined and blank the a11y state the alias just set. React folds
      // rawProps before it destructures for the same reason.
      mount(ROOT_TAG, () => (
        <Slider value={0.2} aria-disabled aria-label="volume" />
      ));
      await tick();
      const props = sliderNode().props;
      expect(props.disabled).toBe(true);
      expect(props.accessibilityState).toEqual({ disabled: true });
      expect(props.accessibilityLabel).toBe('volume');
    });
  });
});
