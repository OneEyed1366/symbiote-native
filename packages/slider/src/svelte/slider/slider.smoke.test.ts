// Smoke test for the real `index.svelte`, compiled through `svelte/compiler` and dynamic-imported
// It mirrors `packages/slider/src/vue/slider/slider.test.ts`: value, events, range and tints

// It also covers the two mounting paths named in the component header
// The default overlay comes from `renderSlider()` and tolerates a 1 or 2 child count
// The custom marker is a hand-authored `{#each}` with a live `stepMarker` Snippet

// The native `RNCSlider` carries no metadata, so the engine derives events and tint processors
// from an injected codegen-shaped ViewConfig, the same one the Vue test injects

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
// From the `native-view-bridge` subpath, as the main barrel re-exports `.svelte` sources
// Vitest has no Svelte plugin here, so its plain transform cannot parse them
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_101;
const SLIDER_VIEW = 'RNCSlider';
// Co-located with the source, as the compiled file's relative imports resolve from its own place
const SLIDER_OUT = join(__dirname, '.smoke-compiled-slider.mjs');
const MARKER_PARENT_OUT = join(__dirname, '.smoke-compiled-marker-parent.mjs');
const BIND_PARENT_OUT = join(__dirname, '.smoke-compiled-bind-parent.mjs');

const fakeColor = (value: unknown): string => `processed(${value})`;

// The codegen-shaped config the engine derives from, the same as in the Vue test
// It has both value rails (bubbling), the sliding and accessibility rails (direct) and the tints
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === SLIDER_VIEW ? RNC_SLIDER_VIEW_CONFIG : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function importDefault(path: string): Promise<Component> {
  const mod: unknown = await import(`file://${path}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${path} produced no default export`);
  }
  return mod.default as Component;
}

async function loadSlider(): Promise<Component> {
  const sliderSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(sliderSource, 'Slider.svelte', SLIDER_OUT);
  return importDefault(SLIDER_OUT);
}

// A parent that supplies a live `stepMarker` Snippet, which only a compiled template can build
// It exercises the custom-marker path: the `{#each}` overlay plus the single bridged leaf
async function loadMarkerParent(): Promise<Component> {
  await loadSlider();
  compileToFile(
    `<script>
       import Slider from './.smoke-compiled-slider.mjs';
     </script>
     {#snippet marker({ stepMarked, index })}
       <view p={{ testID: 'marker-' + index, style: { opacity: stepMarked ? 1 : 0 } }} />
     {/snippet}
     <Slider value={0.5} minimumValue={0} maximumValue={1} step={0.25} stepMarker={marker} />`,
    'MarkerParent.svelte',
    MARKER_PARENT_OUT,
  );
  return importDefault(MARKER_PARENT_OUT);
}

// A parent that owns `value` in `$state` and binds it to Slider with `bind:value`
// Only a compiled template builds the `bind:` directive, so this covers the `$bindable()` sync
async function loadBindParent(): Promise<Component> {
  await loadSlider();
  compileToFile(
    `<script>
       import Slider from './.smoke-compiled-slider.mjs';
       let { report, initial } = $props();
       let value = $state(initial);
       $effect(() => { report(value); });
     </script>
     <Slider bind:value minimumValue={0} maximumValue={1} step={0.1} />`,
    'BindParent.svelte',
    BIND_PARENT_OUT,
  );
  return importDefault(BIND_PARENT_OUT);
}

function sliderNode(): ILiveNode {
  const node = live.findLive(live.appRoot(), n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

async function mountSlider(props: Record<string, unknown>): Promise<void> {
  const Slider = await loadSlider();
  mount(ROOT_TAG, Slider, props);
  await tick();
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(SLIDER_OUT, { force: true });
  rmSync(MARKER_PARENT_OUT, { force: true });
  rmSync(BIND_PARENT_OUT, { force: true });
});

// No Negative group, as the component never rejects input and every prop is optional
// An inverted limit pair only logs through `isInvalidLimitConfig`
// Every case checks which bridge shape and which resolved props reach the native leaf
describe('Slider (real compiled index.svelte)', () => {
  describe('Positive (default-overlay bridge, prop folding, event routing, bind:value)', () => {
    it('paints the raw RNCSlider leaf inside a centering wrapper View', async () => {
      // A literal `RNCSlider` tag would parse as a component
      // So the bridge is what puts the native leaf on the tree
      await mountSlider({
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.1,
      });
      const props = sliderNode().payload;
      expect(props.value).toBe(0.5);
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0.1);
      // The native leaf lives under a view wrapper, not at the root
      expect(
        live.findLive(live.appRoot(), n => n.viewName === 'RCTView'),
      ).toBeDefined();
    });

    it('defaults range + limits the way the core fold does', async () => {
      // An app that supplies only `value` still gets the library's own range defaults
      // They are min 0, max 1, step 0 and the safe-integer limits, never undefined props
      await mountSlider({ value: 0.3 });
      const props = sliderNode().payload;
      expect(props.minimumValue).toBe(0);
      expect(props.maximumValue).toBe(1);
      expect(props.step).toBe(0);
      expect(props.lowerLimit).toBe(Number.MIN_SAFE_INTEGER);
      expect(props.upperLimit).toBe(Number.MAX_SAFE_INTEGER);
      expect(props.inverted).toBe(false);
      expect(props.disabled).toBe(false);
    });

    it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', async () => {
      // `sanitizeSliderValue` sends 0 and NaN as undefined, so native keeps its own initial value
      // A literal 0 write would be taken as a real position
      await mountSlider({ value: 0 });
      expect(sliderNode().payload.value).toBeUndefined();
      unmount(ROOT_TAG);
      fabric.reset();
      await mountSlider({ value: Number.NaN });
      expect(sliderNode().payload.value).toBeUndefined();
    });

    it('forwards tint props and runs them through the derived processor', async () => {
      // The color props carry `{ process: fakeColor }` in the ViewConfig
      // An unprocessed value on the node means the processor wiring is broken
      await mountSlider({
        value: 0.2,
        minimumTrackTintColor: '#ff0000',
        maximumTrackTintColor: '#00ff00',
        thumbTintColor: '#0000ff',
      });
      const props = sliderNode().payload;
      expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
      expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
      expect(props.thumbTintColor).toBe('processed(#0000ff)');
    });

    it('maps both native value rails onto onValueChange(value)', async () => {
      // The ViewConfig declares the value change as both `topChange` and `topRNCSliderValueChange`
      // Missing either rail drops updates on the platform that emits it
      let changed: number | undefined;
      await mountSlider({
        value: 0.2,
        onValueChange: (value: number) => (changed = value),
      });
      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
      expect(changed).toBe(0.7);
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', {
        value: 0.42,
      });
      expect(changed).toBe(0.42);
    });

    it('maps the direct sliding events onto their callbacks', async () => {
      // `onSlidingStart` and `onSlidingComplete` mark drag boundaries, unlike `onValueChange`
      // An app that debounces work to slide-complete needs them routed independently
      let startedAt: number | undefined;
      let completedAt: number | undefined;
      await mountSlider({
        value: 0.2,
        onSlidingStart: (value: number) => (startedAt = value),
        onSlidingComplete: (value: number) => (completedAt = value),
      });
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

    it('resolves disabled from accessibilityState when no explicit boolean', async () => {
      // `resolveSliderDisabled` falls back to `accessibilityState`, as the library wrapper does
      await mountSlider({ value: 0.2, accessibilityState: { disabled: true } });
      expect(sliderNode().payload.disabled).toBe(true);
    });

    it('does NOT leak the JS onValueChange callback to the native node as a prop', async () => {
      // A function reaching the native side would crash prop serialization or silently no-op
      // The callback belongs in the routed event keys, never as a plain attribute
      await mountSlider({ value: 0.2, onValueChange: () => undefined });
      expect(typeof sliderNode().payload.onValueChange).not.toBe('function');
    });

    it('renders the default step indicator when renderStepNumber is set (2-child bridge shape)', async () => {
      // Opting into step numbers adds the StepsIndicator overlay as a second child of the wrapper
      // The native leaf stays where it was
      await mountSlider({
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.5,
        renderStepNumber: true,
      });
      const container = live.findLive(
        live.appRoot(),
        n => n.props.testID === 'StepsIndicator-Container',
      );
      expect(container, 'a StepsIndicator container is painted').toBeDefined();
      // Still exactly one native leaf under the same wrapper
      expect(sliderNode().payload.value).toBe(0.5);
    });

    it('tolerates the bridged child count changing between mounts (no-steps -> steps)', async () => {
      // The `renderSlider()` shape varies between 1 and 2 children as `renderStepNumber` toggles
      // So the sync must rebuild on a child-count change
      await mountSlider({
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.5,
      });
      expect(
        live.findLive(
          live.appRoot(),
          n => n.props.testID === 'StepsIndicator-Container',
        ),
      ).toBeUndefined();
      unmount(ROOT_TAG);
      fabric.reset();
      await mountSlider({
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.5,
        renderStepNumber: true,
      });
      expect(
        live.findLive(
          live.appRoot(),
          n => n.props.testID === 'StepsIndicator-Container',
        ),
      ).toBeDefined();
      expect(sliderNode().payload.value).toBe(0.5);
    });

    it('renders a custom stepMarker overlay and still bridges the native leaf', async () => {
      // The custom-marker path is live template content, as a Snippet no Descriptor can carry
      // The overlay markers and the single native leaf must coexist, neither displacing the other
      const MarkerParent = await loadMarkerParent();
      mount(ROOT_TAG, MarkerParent);
      await tick();
      await tick();

      // `computeStepOptions` with step 0.25 over 0..1 gives 5 points, one marker per point
      const markers = fabric.findAll(
        n =>
          typeof n.props.testID === 'string' &&
          n.props.testID.startsWith('marker-'),
      );
      expect(markers).toHaveLength(5);

      const node = sliderNode();
      expect(node.props.value).toBe(0.5);
    });

    it('syncs a bind:value binding on the same report path as onValueChange', async () => {
      // `$bindable()` is sugar over the `value` and `onValueChange` contract
      // A `bind:value` caller sees the same updates `onValueChange` gets, with no separate resync
      const reported: number[] = [];
      const BindParent = await loadBindParent();
      mount(ROOT_TAG, BindParent, {
        report: (value: number) => reported.push(value),
        initial: 0.2,
      });
      await tick();
      await tick();

      expect(reported.at(-1)).toBe(0.2);
      expect(sliderNode().payload.value).toBe(0.2);

      // The slider is uncontrolled during a drag, so `bind:value` reflects only what native reports
      // It rides the `handleValueChange` path, right beside `onValueChange`
      fabric.fireEvent(sliderNode().instanceHandle, 'topChange', {
        value: 0.7,
      });
      await tick();
      expect(reported.at(-1)).toBe(0.7);

      fabric.fireEvent(sliderNode().instanceHandle, 'topRNCSliderValueChange', {
        value: 0.45,
      });
      await tick();
      expect(reported.at(-1)).toBe(0.45);
    });
  });
});
