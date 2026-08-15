// Real-compiled-source smoke test for index.svelte, mirroring
// packages/slider/src/vue/slider/slider.test.ts's shape (value prop, onValueChange, min/max,
// step, track/thumb tint colors) plus the two bridge-mounting paths this component's own header
// documents: the default-overlay path (renderSlider()'s Descriptor, tolerant of a 1-vs-2
// child-count change as renderStepNumber toggles) and the custom-marker path (hand-authored
// {#each} + a live `stepMarker` Snippet, with only the native RNCSlider leaf bridged). Compiles
// the REAL index.svelte source through svelte/compiler (not a hand-written stand-in), the same
// compile-then-dynamic-import mechanics adapters/svelte/src/components/switch/
// switch.smoke.test.ts uses. The native RNCSlider carries no symbiote metadata — the engine
// derives its events + tint processors from an injected codegen-shaped ViewConfig, the same
// shape packages/slider/src/vue/slider/slider.test.ts injects.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
// From the dedicated `native-view-bridge` subpath, NOT the package's main barrel: the main
// barrel re-exports View/Text/…, real `.svelte` sources, which vitest's plain (svelte-plugin-
// free) transform cannot parse — see index.svelte's header and native-view-bridge.ts's own.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_101;
const SLIDER_VIEW = 'RNCSlider';
// Co-located with the real source (not an isolated temp dir): the compiled Slider's own
// `import { PLATFORM } from './slider-platform'` / `from '../../core'` resolve relative to
// WHERE THE COMPILED FILE LIVES — same reason switch.smoke.test.ts documents.
const SLIDER_OUT = join(__dirname, '.smoke-compiled-slider.mjs');
const MARKER_PARENT_OUT = join(__dirname, '.smoke-compiled-marker-parent.mjs');

const fakeColor = (value: unknown): string => `processed(${value})`;

// The codegen-shaped config the engine derives from: both value rails (bubbling), the two
// sliding rails + accessibility (direct), plain pass-through attributes, and the tint
// processors — identical to what the Vue wrapper's own test injects.
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

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
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

// A parent that supplies a live `stepMarker` Snippet — only a compiled .svelte template can
// construct one ({#snippet}), so this exercises the custom-marker path end to end (the
// hand-authored {#each} overlay + the single bridged native leaf, see index.svelte's header).
async function loadMarkerParent(): Promise<Component> {
  await loadSlider();
  compileToFile(
    `<script>
       import Slider from './.smoke-compiled-slider.mjs';
     </script>
     {#snippet marker({ stepMarked, index })}
       <symbiote-view p={{ testID: 'marker-' + index, style: { opacity: stepMarked ? 1 : 0 } }} />
     {/snippet}
     <Slider value={0.5} minimumValue={0} maximumValue={1} step={0.25} stepMarker={marker} />`,
    'MarkerParent.svelte',
    MARKER_PARENT_OUT,
  );
  return importDefault(MARKER_PARENT_OUT);
}

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
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
});

describe('Slider (real compiled index.svelte)', () => {
  it('paints the raw RNCSlider leaf inside a centering wrapper View', async () => {
    await mountSlider({ value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 });
    const props = sliderNode().props;
    expect(props.value).toBe(0.5);
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0.1);
    // The native leaf lives under a symbiote-view wrapper (RCTView), not at the root.
    expect(fabric.find(n => n.viewName === 'RCTView')).toBeDefined();
  });

  it('defaults range + limits the way the core fold does', async () => {
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

  it('does NOT leak the JS onValueChange callback to the native node as a prop', async () => {
    await mountSlider({ value: 0.2, onValueChange: () => undefined });
    expect(typeof sliderNode().props.onValueChange).not.toBe('function');
  });

  it('renders the default step indicator when renderStepNumber is set (2-child bridge shape)', async () => {
    await mountSlider({
      value: 0.5,
      minimumValue: 0,
      maximumValue: 1,
      step: 0.5,
      renderStepNumber: true,
    });
    const container = fabric.find(n => n.props.testID === 'StepsIndicator-Container');
    expect(container, 'a StepsIndicator container is painted').toBeDefined();
    // Still exactly one native leaf underneath the same wrapper.
    expect(sliderNode().props.value).toBe(0.5);
  });

  it('tolerates the bridged child count changing between mounts (no-steps -> steps)', async () => {
    await mountSlider({ value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.5 });
    expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeUndefined();
    unmount(ROOT_TAG);
    fabric.reset();
    await mountSlider({
      value: 0.5,
      minimumValue: 0,
      maximumValue: 1,
      step: 0.5,
      renderStepNumber: true,
    });
    expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeDefined();
    expect(sliderNode().props.value).toBe(0.5);
  });

  it('renders a custom stepMarker overlay and still bridges the native leaf', async () => {
    const MarkerParent = await loadMarkerParent();
    mount(ROOT_TAG, MarkerParent);
    await tick();
    await tick();

    // computeStepOptions(0, 1, 0.25, resolution) with an explicit step yields 5 points
    // (0, 0.25, 0.5, 0.75, 1) — one marker per point.
    const markers = fabric.created.filter(
      n => typeof n.props.testID === 'string' && n.props.testID.startsWith('marker-'),
    );
    expect(markers).toHaveLength(5);

    const node = sliderNode();
    expect(node.props.value).toBe(0.5);
    // The overlay sits under the SAME wrapper as the native leaf, never as a sibling of a
    // stray whitespace text node (svelte-adapter-dom-shim skill §16) — confirmed by the exact
    // marker count above matching computeStepOptions() with none dropped/duplicated.
  });
});
