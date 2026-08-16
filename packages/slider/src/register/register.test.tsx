// Regression test for the package-level RNCSlider fallback registration. The app/examples still
// inject RN's ReactNativeViewConfigRegistry when available, but @symbiote-native/slider must be self-
// contained: importing this package registers RNCSlider's events + tint processors even when the
// registry lookup misses on a real host. Driven through React purely as the test harness — the
// registration itself (registerComponent, engine-level) is framework-agnostic and every adapter's
// barrel pulls this same module, so there is no separate Angular/Vue twin of this file.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import { setColorProcessor, type ISymbioteEvent } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import './index';

vi.mock('@react-native-community/slider/dist/RNCSliderNativeComponent', () => ({}));

const ROOT_TAG = 313;
const SLIDER_VIEW = 'RNCSlider';

const fabric = installFabric();

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

function numberFromEvent(event: ISymbioteEvent): number | undefined {
  const value = event.nativeEvent.value;
  return typeof value === 'number' ? value : undefined;
}

beforeEach(() => {
  fabric.reset();
  // Simulates the registry-miss case the module comment describes: no RN ViewConfig registry
  // metadata is available, so anything that resolves must come from THIS package's own fallback.
  setNativeViewConfigSource(() => undefined);
  setColorProcessor(value => `processed(${String(value)})`);
});

afterEach(() => {
  unmount(ROOT_TAG);
  setColorProcessor(value => value);
});

// registerComponent() has no throwing path reachable from here — it's a side-effecting call at
// module load time. A single Positive group proves the fallback metadata it installs actually
// drives the engine (color processors + event routing), not just that the call didn't throw.
describe('RNCSlider package registration', () => {
  describe('Positive', () => {
    it('processes slider tint colors without RN ViewConfig registry metadata', () => {
      // why: @symbiote-native/slider must be self-contained — an app that never wired RN's own
      // ViewConfig registry (or one where the lookup misses on a real host) must still see tint
      // colors reach the native view processed, not as raw CSS strings the native side can't read.
      mount(
        ROOT_TAG,
        createElement('RNCSlider', {
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

    it('routes slider native value events without RN ViewConfig registry metadata', () => {
      // why: both value rails (the bubbling `topChange` and the library's own
      // `topRNCSliderValueChange`) must reach the same JS handler — an adapter that only wires
      // one of the two would silently miss value updates depending on which rail a given RN
      // version fires.
      let changed: number | undefined;
      const onChange = (event: ISymbioteEvent): void => {
        changed = numberFromEvent(event);
      };

      mount(ROOT_TAG, createElement('RNCSlider', { onChange, onRNCSliderValueChange: onChange }));

      const node = sliderNode();
      fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.25 });
      expect(changed).toBe(0.25);
      fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.75 });
      expect(changed).toBe(0.75);
    });

    it('routes slider direct events without RN ViewConfig registry metadata', () => {
      // why: sliding-start/complete/accessibility-action are registered `direct: true` (not
      // bubbling) — proves the fallback metadata preserves that distinction rather than
      // defaulting every event to bubbling, which would change how the engine dispatches it.
      let completedAt: number | undefined;

      mount(
        ROOT_TAG,
        createElement('RNCSlider', {
          onRNCSliderSlidingComplete: (event: ISymbioteEvent): void => {
            completedAt = numberFromEvent(event);
          },
        }),
      );

      fabric.fireEvent(sliderNode().instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.5 });
      expect(completedAt).toBe(0.5);
    });
  });
});
