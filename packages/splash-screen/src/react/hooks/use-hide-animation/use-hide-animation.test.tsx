// Co-located React-driven test (ADR 0025) for useHideAnimation. Mocks react-native-bootsplash's
// hide()/isVisible() (imported straight from the npm package by core/hide.ts) and installs a
// fake __turboModuleProxy so getHideAnimationConstants() resolves without a real native host.
//
// Two failure groups, split by whether the failure is recoverable. Degraded covers the runtime
// failures of a native module that DOES exist — a rejected hide(), a throwing animate() — which
// core/ fails open on and reports through config.onError. Negative covers a MISSING RNBootSplash,
// which is a build error and throws; core/ deliberately does not soften it. Both halves are
// shared-core behavior, and every adapter's sibling test file proves them through its own
// lifecycle.

import { Component, createElement, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useHideAnimation } from './index';
import type {
  IHideAnimationConfig,
  IHideAnimationFailure,
  IHideAnimationResult,
  IManifest,
} from '../../../core';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const ROOT_TAG = 900;

const FAKE_NATIVE_MODULE = { getConstants: () => ({ darkModeEnabled: false }) };
const DARK_MODE_NATIVE_MODULE = { getConstants: () => ({ darkModeEnabled: true }) };

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

let activeNativeModule: unknown = FAKE_NATIVE_MODULE;

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null =>
    name === 'RNBootSplash' && isPresent<T>(activeNativeModule) ? activeNativeModule : null,
});

const MANIFEST: IManifest = {
  background: '#fff',
  darkBackground: '#000',
  logo: { width: 100, height: 100 },
};

const results: IHideAnimationResult[] = [];

function Probe(props: { config: IHideAnimationConfig }): ReactElement {
  results.push(useHideAnimation(props.config));
  return createElement(View);
}

type IBoundaryProps = { children: ReactNode; onError: (error: Error) => void };
type IBoundaryState = { hasFailed: boolean };

// mount() reports a render throw to the host rather than rethrowing it (adapters/react/src/
// render.ts, matching React's own defaults), so the mount() call site never sees the error object.
// A boundary hands the test the real Error to assert the MESSAGE on, which a spy on the report
// channel could only do by string-matching a formatted log line.
class CaptureBoundary extends Component<IBoundaryProps, IBoundaryState> {
  readonly state: IBoundaryState = { hasFailed: false };

  static getDerivedStateFromError(): IBoundaryState {
    return { hasFailed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.hasFailed ? null : this.props.children;
  }
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  activeNativeModule = FAKE_NATIVE_MODULE;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('useHideAnimation', () => {
  describe('Positive (readiness gate + style plumbing)', () => {
    it('reports the skip sentinel and no onLoadEnd when logo is omitted', () => {
      // why: a splash with no logo asset configured must not wait on an onLoadEnd that will
      // never fire — the sentinel source lets the app skip rendering the Image entirely.
      mount(ROOT_TAG, createElement(Probe, { config: { manifest: MANIFEST, animate: () => {} } }));

      const last = results[results.length - 1];
      expect(last.logo.source).toBe(-1);
      expect(last.logo.onLoadEnd).toBeUndefined();
    });

    it('returns the full logo/brand shape when both are provided', () => {
      // why: the hook must hand the app the same container/logo/brand prop bags
      // react-native-bootsplash's own hook produces, so an app can bind them straight onto
      // View/Image without any adapter-specific shape.
      const config: IHideAnimationConfig = {
        manifest: { ...MANIFEST, brand: { bottom: 20, width: 60, height: 20 } },
        logo: 123,
        brand: 456,
        animate: () => {},
      };

      mount(ROOT_TAG, createElement(Probe, { config }));

      const last = results[results.length - 1];
      expect(last.logo.source).toBe(123);
      expect(last.logo.resizeMode).toBe('contain');
      expect(last.brand.source).toBe(456);
      expect(last.brand.resizeMode).toBe('contain');
    });

    it('hides exactly once, only after layout + logo load-end both resolve', async () => {
      // why: the splash must stay up until every readiness signal (native layout, the
      // logo image, and the app's own `ready`, defaulted true here) has reported in —
      // hiding early would flash unstyled/unloaded content underneath.
      const { hide } = await import('react-native-bootsplash');
      let animateCalls = 0;
      const config: IHideAnimationConfig = {
        manifest: MANIFEST,
        logo: 1,
        ready: true,
        animate: () => {
          animateCalls += 1;
        },
      };

      mount(ROOT_TAG, createElement(Probe, { config }));
      const result = results[results.length - 1];

      expect(hide).not.toHaveBeenCalled();
      result.container.onLayout();
      expect(hide).not.toHaveBeenCalled();

      result.logo.onLoadEnd?.();

      expect(hide).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledWith({ fade: false });
      await vi.waitFor(() => expect(animateCalls).toBe(1));
    });

    it('does not hide again once already triggered', async () => {
      // why: HideAnimationController.animateHasBeenCalled must fail closed — re-firing the
      // same readiness callback (e.g. a duplicate native layout event) must not replay the
      // fade-out animation.
      const { hide } = await import('react-native-bootsplash');
      const config: IHideAnimationConfig = { manifest: MANIFEST, ready: true, animate: () => {} };

      mount(ROOT_TAG, createElement(Probe, { config }));
      const result = results[results.length - 1];

      result.container.onLayout();
      await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1));

      result.container.onLayout();
      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('holds hide() back while ready is explicitly false, even once layout + logo resolve', async () => {
      // why: `ready` lets the app gate the splash on its OWN async work (auth check, data
      // prefetch) finishing — layout+image readiness alone must not be enough to hide.
      // (This mount captures ready:false at construction only; the no-deps-array useEffect
      // documented in index.ts exists to re-sync a ready flag that flips true across a LATER
      // render — this harness's mount() always tears down + rebuilds rather than re-rendering
      // an existing tree, so that later-render flip isn't exercised here. The Vue and Angular
      // sibling test files each prove the equivalent flip through their own reactivity.)
      const { hide } = await import('react-native-bootsplash');
      const config: IHideAnimationConfig = {
        manifest: MANIFEST,
        logo: 1,
        ready: false,
        animate: () => {},
      };

      mount(ROOT_TAG, createElement(Probe, { config }));
      const result = results[results.length - 1];

      result.container.onLayout();
      result.logo.onLoadEnd?.();

      expect(
        hide,
        'ready:false must block hide() even with every other gate satisfied',
      ).not.toHaveBeenCalled();
    });

    it('reads darkModeEnabled from native constants and swaps in the dark logo/background', async () => {
      // why: getHideAnimationConstants() is the ONLY source of darkModeEnabled — the hook
      // must thread it through to computeHideAnimationStyles so a dark-mode device shows
      // manifest.darkBackground / darkLogo instead of the light-mode assets.
      activeNativeModule = DARK_MODE_NATIVE_MODULE;
      const config: IHideAnimationConfig = {
        manifest: MANIFEST,
        logo: 1,
        darkLogo: 2,
        animate: () => {},
      };

      mount(ROOT_TAG, createElement(Probe, { config }));

      const last = results[results.length - 1];
      expect(last.logo.source).toBe(2);
    });

    it('fires hide() when config.ready is omitted entirely, defaulting to true', async () => {
      // why: HideAnimationController's constructor reads `config.ready ?? true` — a caller who
      // never wires up their own readiness gate (no async boot work to wait on) must still get
      // the splash hidden once layout/logo settle, not have it stuck forever for lack of an
      // explicit `ready: true`.
      const { hide } = await import('react-native-bootsplash');
      const config: IHideAnimationConfig = { manifest: MANIFEST, animate: () => {} };

      mount(ROOT_TAG, createElement(Probe, { config }));
      const result = results[results.length - 1];

      result.container.onLayout();
      await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1));
      expect(hide).toHaveBeenCalledWith({ fade: false });
    });
  });

  describe('Degraded (fail open, report loudly)', () => {
    it('still runs animate and reports the failure when hide() rejects', async () => {
      // why: animateHasBeenCalled is already true by the time hide() settles, so a swallowed
      // rejection shut the gate for good — animate() never ran, no readiness callback could
      // retry, and the caller's splash overlay stayed on screen over a dead app. Failing open
      // costs at worst a fade over a still-visible native splash.
      const { hide } = await import('react-native-bootsplash');
      const hideError = new Error('native hide failed');
      vi.mocked(hide).mockImplementationOnce(() => Promise.reject(hideError));

      const failures: IHideAnimationFailure[] = [];
      let animateCalls = 0;
      const config: IHideAnimationConfig = {
        manifest: MANIFEST,
        ready: true,
        animate: () => {
          animateCalls += 1;
        },
        onError: failure => failures.push(failure),
      };

      mount(ROOT_TAG, createElement(Probe, { config }));
      const result = results[results.length - 1];

      result.container.onLayout();
      await vi.waitFor(() => expect(animateCalls).toBe(1));

      expect(failures).toEqual([{ stage: 'hide', error: hideError }]);
    });

    it('reports the failure when the caller own animate() throws, without an unhandled rejection', async () => {
      // why: animate() now runs off a .then() that nothing else catches — a caller whose
      // fade-out throws would otherwise turn a cosmetic bug into an unhandled rejection.
      const failures: IHideAnimationFailure[] = [];
      const animateError = new Error('caller animation failed');
      const config: IHideAnimationConfig = {
        manifest: MANIFEST,
        ready: true,
        animate: () => {
          throw animateError;
        },
        onError: failure => failures.push(failure),
      };

      mount(ROOT_TAG, createElement(Probe, { config }));
      results[results.length - 1].container.onLayout();

      await vi.waitFor(() => expect(failures).toEqual([{ stage: 'animate', error: animateError }]));
    });
  });

  describe('Negative', () => {
    it('throws out of render when the native RNBootSplash module is not registered', () => {
      // why: a missing RNBootSplash is a BUILD error — the module is either linked or it is not,
      // deterministically, on the first launch. Upstream's spec is a bare
      // TurboModuleRegistry.getEnforcing() that throws at import time for exactly this reason,
      // and this repo has a live footgun that depends on it staying loud: `npm install` deletes
      // the `.rn-bootsplash/` folder the podspec vendors at pod-install time, so a skipped
      // `pod install` produces precisely this. Softening it to a light-mode fallback would let
      // that ship looking fine.
      activeNativeModule = null;
      const captured: Error[] = [];
      const config: IHideAnimationConfig = { manifest: MANIFEST, animate: () => {} };
      // The throw is the point of this test, and mount() now reports it to the host - silenced so
      // a passing run does not print a stack trace that reads like a failure.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      mount(
        ROOT_TAG,
        createElement(CaptureBoundary, {
          onError: (error: Error) => captured.push(error),
          children: createElement(Probe, { config }),
        }),
      );

      expect(captured).toHaveLength(1);
      expect(String(captured[0])).toMatch(/RNBootSplash/);
      expect(results, 'the hook must not hand back defaults it could not read').toHaveLength(0);
      consoleError.mockRestore();
    });
  });
});
